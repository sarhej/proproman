import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma, prismaUnscoped } from "../db.js";
import { trustedBusinessDomainFromEmail } from "../lib/emailDomainPolicy.js";
import { normalizePublicTenantSlug } from "../lib/publicTenantSlug.js";
import { provisionInviteeMemberForTenant } from "../lib/provisionTenantRequestInvitees.js";
import { applyWorkspaceInviteSideEffects } from "../lib/workspaceInviteSideEffects.js";
import { requireRole } from "../middleware/auth.js";
import {
  isTransactionalEmailEnabled,
  isTransactionalEmailReady,
  logTransactionalEmail,
  sendTransactionalEmail,
} from "../services/transactionalMail.js";
import { getSuperAdminEmailsOrdered, layoutE1Recipients } from "../services/transactionalRecipients.js";
import {
  buildE1NewWorkspaceRequestEmail,
  buildE2WorkspaceApprovedEmail,
  buildE3WorkspaceRejectedEmail,
  buildE5WorkspaceInviteEmail,
  normalizeTransactionalLocale,
} from "../services/transactionalTemplates.js";
import { provisionTenant } from "../tenant/tenantProvisioning.js";

export const tenantRequestsRouter = Router();

const slugRegex = /^[a-z0-9-]+$/;

const uiLocaleSchema = z.enum(["en", "cs", "sk", "pl", "uk"]).optional();

/** Exported for contract tests (must match POST / body validation). */
export const createRequestSchema = z.object({
  teamName: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  contactEmail: z.string().email(),
  contactName: z.string().min(1).max(100),
  message: z.string().max(1000).optional(),
  locale: uiLocaleSchema,
  inviteEmails: z.array(z.string().email()).max(20).optional().default([]),
  trustCompanyDomain: z.boolean().optional().default(false),
});

function normalizeInviteEmailsForRequest(contactEmail: string, inviteEmails: string[]): string[] {
  const ce = contactEmail.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of inviteEmails) {
    const e = raw.trim().toLowerCase();
    if (!e || e === ce) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/**
 * Public endpoint — no auth required.
 * Anyone can submit a request to register a new team/tenant.
 */
tenantRequestsRouter.post("/", async (req, res, next) => {
  try {
    const data = createRequestSchema.parse(req.body);

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: data.slug },
    });
    if (existingTenant) {
      res.status(409).json({ error: "A workspace with this slug already exists." });
      return;
    }

    const existingRequest = await prisma.tenantRequest.findUnique({
      where: { slug: data.slug },
    });
    if (existingRequest) {
      res.status(409).json({ error: "A registration request with this slug already exists." });
      return;
    }

    const inviteEmailsNorm = normalizeInviteEmailsForRequest(data.contactEmail, data.inviteEmails);
    let trustCompanyDomain = data.trustCompanyDomain;
    let trustedEmailDomain: string | null = null;
    if (trustCompanyDomain) {
      trustedEmailDomain = trustedBusinessDomainFromEmail(data.contactEmail);
      if (!trustedEmailDomain) {
        trustCompanyDomain = false;
      }
    }

    const tenantRequest = await prisma.tenantRequest.create({
      data: {
        teamName: data.teamName,
        slug: data.slug,
        contactEmail: data.contactEmail,
        contactName: data.contactName,
        message: data.message,
        preferredLocale: data.locale ?? null,
        inviteEmails: inviteEmailsNorm.length > 0 ? inviteEmailsNorm : undefined,
        trustCompanyDomain,
        trustedEmailDomain: trustCompanyDomain && trustedEmailDomain ? trustedEmailDomain : null,
      },
    });

    let adminsNotifiedOnSubmit = false;
    if (isTransactionalEmailEnabled() && isTransactionalEmailReady()) {
      try {
        const ordered = await getSuperAdminEmailsOrdered();
        const layout = layoutE1Recipients(ordered);
        if (layout) {
          const locale = normalizeTransactionalLocale(tenantRequest.preferredLocale);
          const mail = buildE1NewWorkspaceRequestEmail({
            locale,
            teamName: tenantRequest.teamName,
            slug: tenantRequest.slug,
            contactEmail: tenantRequest.contactEmail,
            contactName: tenantRequest.contactName,
            requestId: tenantRequest.id,
          });
          await sendTransactionalEmail({
            to: layout.to,
            cc: layout.cc.length > 0 ? layout.cc : undefined,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            tags: [{ name: "event", value: "E1" }],
          });
          adminsNotifiedOnSubmit = true;
          logTransactionalEmail("E1", { ok: true, requestId: tenantRequest.id });
        } else {
          logTransactionalEmail("E1", { ok: false, reason: "no_recipients" });
        }
      } catch (err) {
        console.error("[transactional-email] E1 send failed:", err);
        logTransactionalEmail("E1", { ok: false, requestId: tenantRequest.id });
      }
    }

    const decisionEmailsConfigured = isTransactionalEmailEnabled() && isTransactionalEmailReady();
    res.status(201).json({
      ...tenantRequest,
      emailNotifications: { adminsNotifiedOnSubmit, decisionEmailsConfigured },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Public endpoint — check request status by ID.
 */
tenantRequestsRouter.get("/status/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const request = await prisma.tenantRequest.findUnique({
      where: { id },
      select: { id: true, teamName: true, status: true, createdAt: true, reviewNote: true },
    });
    if (!request) {
      res.status(404).json({ error: "Request not found." });
      return;
    }
    res.json(request);
  } catch (err) {
    next(err);
  }
});

/**
 * Public diagnostic — correlates TenantRequest vs Tenant for a slug.
 * Mounted in `index.ts` **before** `app.use("/api/tenant-requests", router)` so requests do not
 * fall through to `mountTenantScoped("/api", …)` (which would apply `requireAuth` and return 401).
 */
export async function tenantRequestLookupBySlugHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const slug = normalizePublicTenantSlug(req.params.slug);
    if (!slug) {
      res.status(400).json({ error: "Invalid slug." });
      return;
    }

    const registrationRequest = await prismaUnscoped.tenantRequest.findFirst({
      where: { slug: { equals: slug, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, slug: true, tenantId: true, teamName: true, reviewNote: true },
    });

    let linkedTenant: { id: string; slug: string; status: string; name: string } | null = null;
    if (registrationRequest?.tenantId) {
      linkedTenant = await prismaUnscoped.tenant.findUnique({
        where: { id: registrationRequest.tenantId },
        select: { id: true, slug: true, status: true, name: true },
      });
    }

    const activeTenantBySlug = await prismaUnscoped.tenant.findFirst({
      where: { slug: { equals: slug, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true, slug: true, status: true, name: true },
    });

    res.json({
      normalizedSlug: slug,
      registrationRequest,
      linkedTenant,
      activeTenantBySlug,
    });
  } catch (err) {
    next(err);
  }
}

// ─── SUPER_ADMIN-only management ──────────────────────────────────

tenantRequestsRouter.get(
  "/",
  requireRole(UserRole.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const status = req.query.status as string | undefined;
      const where = status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : {};
      const requests = await prisma.tenantRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      res.json({ requests });
    } catch (err) {
      next(err);
    }
  }
);

tenantRequestsRouter.get(
  "/:id",
  requireRole(UserRole.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const tenantRequest = await prisma.tenantRequest.findUnique({
        where: { id },
      });
      if (!tenantRequest) {
        res.status(404).json({ error: "Request not found." });
        return;
      }
      res.json(tenantRequest);
    } catch (err) {
      next(err);
    }
  }
);

export const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(500).optional(),
});

tenantRequestsRouter.post(
  "/:id/review",
  requireRole(UserRole.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const data = reviewSchema.parse(req.body);
      const tenantRequest = await prisma.tenantRequest.findUnique({
        where: { id },
      });

      if (!tenantRequest) {
        res.status(404).json({ error: "Request not found." });
        return;
      }
      if (tenantRequest.status !== "PENDING") {
        res.status(400).json({ error: `Request already ${tenantRequest.status.toLowerCase()}.` });
        return;
      }

      if (data.action === "reject") {
        const updated = await prisma.tenantRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            reviewedBy: req.user!.id,
            reviewedAt: new Date(),
            reviewNote: data.reviewNote ?? null,
          },
        });

        let requesterNotifiedOnDecision = false;
        if (isTransactionalEmailEnabled() && isTransactionalEmailReady()) {
          try {
            const locale = normalizeTransactionalLocale(tenantRequest.preferredLocale);
            const mail = buildE3WorkspaceRejectedEmail({
              locale,
              teamName: tenantRequest.teamName,
              slug: tenantRequest.slug,
              reviewNote: updated.reviewNote,
            });
            await sendTransactionalEmail({
              to: tenantRequest.contactEmail,
              subject: mail.subject,
              text: mail.text,
              html: mail.html,
              tags: [{ name: "event", value: "E3" }],
            });
            requesterNotifiedOnDecision = true;
            logTransactionalEmail("E3", { ok: true, requestId: id });
          } catch (err) {
            console.error("[transactional-email] E3 send failed:", err);
            logTransactionalEmail("E3", { ok: false, requestId: id });
          }
        }

        res.json({
          ...updated,
          emailNotifications: { requesterNotifiedOnDecision },
        });
        return;
      }

      // Approve: create tenant, provision, create owner membership, link request
      const schemaName = `tenant_${tenantRequest.slug.replace(/-/g, "_")}`;

      const tenant = await prisma.tenant.create({
        data: {
          name: tenantRequest.teamName,
          slug: tenantRequest.slug,
          schemaName,
          status: "PROVISIONING",
          migrationState: {
            create: { schemaVersion: 0, status: "pending" },
          },
        },
      });

      await provisionTenant(tenant.id);

      const provisionedTenant = await prisma.tenant.findUnique({ where: { id: tenant.id } });

      // Create or find the contact user and make them OWNER.
      // If they already signed in earlier and were auto-created as PENDING,
      // approval must also activate their global role so they can enter the app.
      let contactUser = await prisma.user.findUnique({
        where: { email: tenantRequest.contactEmail },
      });
      if (!contactUser) {
        contactUser = await prisma.user.create({
          data: {
            email: tenantRequest.contactEmail,
            name: tenantRequest.contactName,
            role: UserRole.ADMIN,
            activeTenantId: tenant.id,
          },
        });
      } else {
        const nextRole =
          contactUser.role === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : UserRole.ADMIN;
        contactUser = await prisma.user.update({
          where: { id: contactUser.id },
          data: {
            name: contactUser.name || tenantRequest.contactName,
            role: nextRole,
            activeTenantId: tenant.id,
          },
        });
      }

      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: contactUser.id } },
        create: { tenantId: tenant.id, userId: contactUser.id, role: "OWNER" },
        update: { role: "OWNER" },
      });

      const rawInviteJson = tenantRequest.inviteEmails;
      const inviteParsed = Array.isArray(rawInviteJson)
        ? rawInviteJson.filter((x): x is string => typeof x === "string")
        : [];
      const filteredInvites = normalizeInviteEmailsForRequest(tenantRequest.contactEmail, inviteParsed);

      const inviteeUserIds: string[] = [];
      await prisma.$transaction(async (tx) => {
        if (tenantRequest.trustCompanyDomain && tenantRequest.trustedEmailDomain) {
          const dom = tenantRequest.trustedEmailDomain.trim().toLowerCase();
          const taken = await tx.tenantDomain.findUnique({ where: { domain: dom } });
          if (!taken) {
            await tx.tenantDomain.create({
              data: { tenantId: tenant.id, domain: dom, isPrimary: true },
            });
          } else if (taken.tenantId !== tenant.id) {
            console.warn("[tenant-requests] TenantDomain already taken; skipping trusted domain row", {
              domain: dom,
              tenantId: tenant.id,
            });
          }
        }
        for (const em of filteredInvites) {
          const { userId } = await provisionInviteeMemberForTenant(tx, {
            email: em,
            tenantId: tenant.id,
          });
          inviteeUserIds.push(userId);
        }
      });

      for (const uid of new Set(inviteeUserIds)) {
        await applyWorkspaceInviteSideEffects(uid, tenant.id);
      }

      const updated = await prisma.tenantRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          reviewNote: data.reviewNote ?? null,
          tenantId: tenant.id,
        },
      });

      let requesterNotifiedOnDecision = false;
      let inviteesNotifiedCount = 0;
      if (isTransactionalEmailEnabled() && isTransactionalEmailReady()) {
        try {
          const locale = normalizeTransactionalLocale(tenantRequest.preferredLocale);
          const mail = buildE2WorkspaceApprovedEmail({
            locale,
            teamName: tenantRequest.teamName,
            slug: tenantRequest.slug,
          });
          await sendTransactionalEmail({
            to: tenantRequest.contactEmail,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            tags: [{ name: "event", value: "E2" }],
          });
          requesterNotifiedOnDecision = true;
          logTransactionalEmail("E2", { ok: true, requestId: id });
        } catch (err) {
          console.error("[transactional-email] E2 send failed:", err);
          logTransactionalEmail("E2", { ok: false, requestId: id });
        }

        if (filteredInvites.length > 0) {
          const locale = normalizeTransactionalLocale(tenantRequest.preferredLocale);
          for (const inviteeEmail of filteredInvites) {
            try {
              const mail = buildE5WorkspaceInviteEmail({
                locale,
                teamName: tenantRequest.teamName,
                slug: tenantRequest.slug,
                inviteeEmail,
              });
              await sendTransactionalEmail({
                to: inviteeEmail,
                subject: mail.subject,
                text: mail.text,
                html: mail.html,
                tags: [{ name: "event", value: "E5" }],
              });
              inviteesNotifiedCount += 1;
              logTransactionalEmail("E5", { ok: true, requestId: id, inviteeEmail });
            } catch (err) {
              console.error("[transactional-email] E5 send failed:", err);
              logTransactionalEmail("E5", { ok: false, requestId: id, inviteeEmail });
            }
          }
        }
      }

      res.json({
        request: updated,
        tenant: provisionedTenant ?? tenant,
        emailNotifications: { requesterNotifiedOnDecision, inviteesNotifiedCount },
      });
    } catch (err) {
      next(err);
    }
  }
);

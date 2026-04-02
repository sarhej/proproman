import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma, prismaUnscoped } from "../db.js";
import { normalizePublicTenantSlug } from "../lib/publicTenantSlug.js";
import { requireRole } from "../middleware/auth.js";
import { provisionTenant } from "../tenant/tenantProvisioning.js";

export const tenantRequestsRouter = Router();

const slugRegex = /^[a-z0-9-]+$/;

const createRequestSchema = z.object({
  teamName: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  contactEmail: z.string().email(),
  contactName: z.string().min(1).max(100),
  message: z.string().max(1000).optional(),
});

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

    const tenantRequest = await prisma.tenantRequest.create({
      data: {
        teamName: data.teamName,
        slug: data.slug,
        contactEmail: data.contactEmail,
        contactName: data.contactName,
        message: data.message,
      },
    });

    res.status(201).json(tenantRequest);
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
      select: { id: true, status: true, slug: true, tenantId: true },
    });

    let linkedTenant: { id: string; slug: string; status: string } | null = null;
    if (registrationRequest?.tenantId) {
      linkedTenant = await prismaUnscoped.tenant.findUnique({
        where: { id: registrationRequest.tenantId },
        select: { id: true, slug: true, status: true },
      });
    }

    const activeTenantBySlug = await prismaUnscoped.tenant.findFirst({
      where: { slug: { equals: slug, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true, slug: true, status: true },
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

const reviewSchema = z.object({
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
        res.json(updated);
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

      res.json({ request: updated, tenant: provisionedTenant ?? tenant });
    } catch (err) {
      next(err);
    }
  }
);

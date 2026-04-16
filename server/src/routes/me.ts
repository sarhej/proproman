import { DeliveryChannel, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma, prismaUnscoped } from "../db.js";
import {
  canManageTenantLocaleSettings,
  normalizeEnabledLocalesPayload,
} from "../lib/appLocales.js";
import { normalizePublicTenantSlug } from "../lib/publicTenantSlug.js";
import { requireAuth, requireSession } from "../middleware/auth.js";
import {
  isTransactionalEmailEnabled,
  logTransactionalEmail,
  sendTransactionalEmail,
} from "../services/transactionalMail.js";
import { buildWorkspaceAccessRequestAdminEmail } from "../services/transactionalTemplates.js";

const channels: DeliveryChannel[] = ["IN_APP", "EMAIL", "SLACK", "WHATSAPP"];

const patchSchema = z.object({
  preferences: z.array(
    z.object({
      channel: z.enum(["IN_APP", "EMAIL", "SLACK", "WHATSAPP"]),
      enabled: z.boolean(),
      channelIdentifier: z.string().optional().nullable()
    })
  )
});

/** Routes that allow `PENDING` users (mounted before `meRouter` in `index.ts`). */
export const meSessionRouter = Router();
meSessionRouter.use(requireSession);

meSessionRouter.get("/workspace-registration-requests", async (req, res, next) => {
  try {
    const email = req.user!.email;
    const requests = await prismaUnscoped.tenantRequest.findMany({
      where: { contactEmail: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        teamName: true,
        slug: true,
        status: true,
        createdAt: true,
        reviewNote: true,
      },
    });
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

/**
 * List / switch workspaces: requireSession only (not requireAuth).
 * Platform role PENDING must still see memberships and set activeTenant — otherwise TenantPicker
 * gets 403, the client treats it like an empty list, and users see "No workspaces available".
 */
meSessionRouter.get("/tenants", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const memberships = await prisma.tenantMembership.findMany({
      where: { userId },
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true, isSystem: true } },
      },
      orderBy: { tenant: { name: "asc" } },
    });
    const activeTenantId =
      req.tenantContext?.tenantId ??
      req.user!.activeTenantId ??
      null;
    res.json({ tenants: memberships, activeTenantId });
  } catch (err) {
    next(err);
  }
});

meSessionRouter.post("/tenants/switch", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const parsed = z.object({ tenantId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { tenantId } = parsed.data;
    const membership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: { select: { id: true, slug: true, status: true } } },
    });
    if (!membership || membership.tenant.status !== "ACTIVE") {
      res.status(403).json({ error: "Not a member of this tenant or tenant is not active." });
      return;
    }
    await prisma.user.update({ where: { id: userId }, data: { activeTenantId: tenantId } });
    req.session.activeTenantId = tenantId;
    req.session.save((saveErr) => {
      if (saveErr) {
        next(saveErr);
        return;
      }
      res.json({ ok: true, activeTenantId: tenantId });
    });
  } catch (err) {
    next(err);
  }
});

const workspaceAccessBody = z.object({
  tenantSlug: z.string().min(1),
});

meSessionRouter.get("/workspace-access-request", async (req, res, next) => {
  try {
    const slugRaw = typeof req.query.tenantSlug === "string" ? req.query.tenantSlug : "";
    const slugNorm = normalizePublicTenantSlug(slugRaw);
    if (!slugNorm) {
      res.status(400).json({ error: "tenantSlug is required." });
      return;
    }
    const tenant = await prismaUnscoped.tenant.findFirst({
      where: { slug: { equals: slugNorm, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true },
    });
    if (!tenant) {
      res.status(404).json({ error: "Workspace not found." });
      return;
    }
    const row = await prismaUnscoped.workspaceAccessRequest.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: req.user!.id } },
      select: { status: true },
    });
    res.json({ pending: row?.status === "PENDING" });
  } catch (err) {
    next(err);
  }
});

meSessionRouter.post("/workspace-access-request", async (req, res, next) => {
  try {
    const parsed = workspaceAccessBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const slugNorm = normalizePublicTenantSlug(parsed.data.tenantSlug);
    if (!slugNorm) {
      res.status(400).json({ error: "Invalid workspace slug." });
      return;
    }
    const userId = req.user!.id;
    const tenant = await prismaUnscoped.tenant.findFirst({
      where: { slug: { equals: slugNorm, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      res.status(404).json({ error: "Workspace not found or not active." });
      return;
    }
    const membership = await prismaUnscoped.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: { id: true },
    });
    if (membership) {
      res.status(409).json({ error: "You are already a member of this workspace." });
      return;
    }

    const existing = await prismaUnscoped.workspaceAccessRequest.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: { id: true, status: true },
    });
    if (existing?.status === "PENDING") {
      res.json({
        pending: true,
        alreadyRequested: true,
        adminsNotified: false,
      });
      return;
    }

    if (existing?.status === "FULFILLED") {
      await prismaUnscoped.workspaceAccessRequest.update({
        where: { id: existing.id },
        data: { status: "PENDING" },
      });
    } else {
      await prismaUnscoped.workspaceAccessRequest.create({
        data: { tenantId: tenant.id, userId, status: "PENDING" },
      });
    }

    const requester = await prismaUnscoped.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    const adminMemberships = await prismaUnscoped.tenantMembership.findMany({
      where: {
        tenantId: tenant.id,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: { select: { email: true, isActive: true } } },
    });
    const requesterEmailNorm = requester?.email.trim().toLowerCase() ?? "";
    const adminEmails = [
      ...new Set(
        adminMemberships
          .filter((m) => m.user.isActive)
          .map((m) => m.user.email.trim().toLowerCase())
          .filter((e) => e.length > 0 && e !== requesterEmailNorm)
      ),
    ];

    let adminsNotified = 0;
    if (isTransactionalEmailEnabled() && adminEmails.length > 0 && requester) {
      const mail = buildWorkspaceAccessRequestAdminEmail({
        workspaceName: tenant.name,
        workspaceSlug: tenant.slug,
        requesterEmail: requester.email,
        requesterName: requester.name ?? "",
      });
      for (const to of adminEmails) {
        try {
          await sendTransactionalEmail({
            to,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            tags: [{ name: "event", value: "workspace_access_admin" }],
          });
          adminsNotified += 1;
          logTransactionalEmail("workspace_access_admin", {
            ok: true,
            tenantId: tenant.id,
            toCount: 1,
          });
        } catch (err) {
          console.error("[transactional-email] workspace_access_admin send failed:", err);
          logTransactionalEmail("workspace_access_admin", { ok: false, tenantId: tenant.id });
        }
      }
    }

    res.json({
      pending: true,
      alreadyRequested: false,
      adminsNotified: adminsNotified > 0,
    });
  } catch (err) {
    next(err);
  }
});

export const meRouter = Router();
meRouter.use(requireAuth);

const patchLanguagesBody = z.object({
  enabledLocales: z.array(z.string()),
});

meRouter.patch("/active-tenant/languages", async (req, res, next) => {
  try {
    const ctx = req.tenantContext;
    if (!ctx) {
      res.status(400).json({ error: "Workspace context required. Select a workspace or set X-Tenant-Id." });
      return;
    }
    if (!canManageTenantLocaleSettings(req.user!.role, ctx.membershipRole)) {
      res.status(403).json({ error: "Only workspace owners and admins can change language options." });
      return;
    }
    const parsed = patchLanguagesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const normalized = normalizeEnabledLocalesPayload(parsed.data.enabledLocales);
    if (!normalized) {
      res.status(400).json({
        error: "enabledLocales must list at least one supported language (en, cs, sk, uk, pl).",
      });
      return;
    }
    const existing = await prismaUnscoped.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { settings: true },
    });
    const prevRaw = existing?.settings;
    const prev =
      prevRaw !== null &&
      prevRaw !== undefined &&
      typeof prevRaw === "object" &&
      !Array.isArray(prevRaw)
        ? { ...(prevRaw as Record<string, unknown>) }
        : {};
    prev.enabledLocales = normalized;
    await prismaUnscoped.tenant.update({
      where: { id: ctx.tenantId },
      data: { settings: prev as Prisma.InputJsonValue },
    });
    res.json({ enabledLocales: normalized });
  } catch (err) {
    next(err);
  }
});

meRouter.get("/notification-preferences", async (req, res) => {
  const userId = req.user!.id;
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId },
    orderBy: { channel: "asc" }
  });
  const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r]));
  const preferences = channels.map((channel) => {
    const row = byChannel[channel];
    return {
      channel,
      enabled: row?.enabled ?? channel === "IN_APP",
      channelIdentifier: row?.channelIdentifier ?? null
    };
  });
  res.json({ preferences });
});

meRouter.patch("/notification-preferences", async (req, res) => {
  const userId = req.user!.id;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  for (const pref of parsed.data.preferences) {
    await prisma.userNotificationPreference.upsert({
      where: {
        userId_channel: { userId, channel: pref.channel as DeliveryChannel }
      },
      create: {
        userId,
        channel: pref.channel as DeliveryChannel,
        enabled: pref.enabled,
        channelIdentifier: pref.channelIdentifier ?? undefined
      },
      update: {
        enabled: pref.enabled,
        ...(pref.channelIdentifier !== undefined && { channelIdentifier: pref.channelIdentifier })
      }
    });
  }
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId },
    orderBy: { channel: "asc" }
  });
  const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r]));
  const preferences = channels.map((channel) => {
    const row = byChannel[channel];
    return {
      channel,
      enabled: row?.enabled ?? channel === "IN_APP",
      channelIdentifier: row?.channelIdentifier ?? null
    };
  });
  res.json({ preferences });
});

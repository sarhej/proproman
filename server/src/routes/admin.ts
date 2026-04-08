import { AuditAction, MembershipRole, Prisma, UserRole } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import {
  isTransactionalEmailEnabled,
  isTransactionalEmailReady,
  logTransactionalEmail,
  sendTransactionalEmail,
} from "../services/transactionalMail.js";
import { buildE4PlatformRoleActivatedEmail } from "../services/transactionalTemplates.js";
import { notificationRulesRouter } from "./notification-rules.js";

export const adminRouter = Router();
adminRouter.use(requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

adminRouter.use("/notification-rules", notificationRulesRouter);

/** Workspace Admin lists users by membership — never the global user table (prevents cross-tenant leaks). */
function requestTenantId(req: Request): string | undefined {
  return req.tenantContext?.tenantId;
}

function membershipRoleForInvitedGlobalRole(role: UserRole): MembershipRole {
  switch (role) {
    case UserRole.SUPER_ADMIN:
    case UserRole.ADMIN:
      return MembershipRole.ADMIN;
    case UserRole.EDITOR:
    case UserRole.MARKETING:
      return MembershipRole.MEMBER;
    case UserRole.VIEWER:
    case UserRole.PENDING:
      return MembershipRole.VIEWER;
    default:
      return MembershipRole.MEMBER;
  }
}

async function requireWorkspaceForUserAdmin(req: Request, res: Response): Promise<string | null> {
  const tid = requestTenantId(req);
  if (!tid) {
    res.status(400).json({
      error: "Workspace context required. Open Admin from a workspace (or set active workspace / X-Tenant-Id) to manage users."
    });
    return null;
  }
  return tid;
}

async function requireTargetUserInWorkspace(
  req: Request,
  res: Response,
  userId: string
): Promise<{ tenantId: string } | null> {
  const tid = await requireWorkspaceForUserAdmin(req, res);
  if (!tid) return null;
  const m = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tid, userId } }
  });
  if (!m) {
    res.status(403).json({ error: "User is not a member of this workspace." });
    return null;
  }
  return { tenantId: tid };
}

adminRouter.get("/users", async (req, res) => {
  const tid = await requireWorkspaceForUserAdmin(req, res);
  if (!tid) return;

  const members = await prisma.tenantMembership.findMany({
    where: { tenantId: tid },
    include: {
      user: {
        include: { emails: { orderBy: { isPrimary: "desc" } } }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  res.json({ users: members.map((m) => m.user) });
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional()
});

adminRouter.put("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const workspaceCtx = await requireTargetUserInWorkspace(req, res, id);
  if (!workspaceCtx) return;

  const actorRole = req.user!.role;

  if (data.role) {
    if (actorRole !== UserRole.SUPER_ADMIN && data.role === UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: "Only SUPER_ADMIN can promote to SUPER_ADMIN" });
      return;
    }
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (
    data.role !== undefined &&
    data.role !== existing.role &&
    existing.role === UserRole.SUPER_ADMIN &&
    actorRole !== UserRole.SUPER_ADMIN
  ) {
    res.status(403).json({ error: "Only SUPER_ADMIN can change roles for super administrator accounts" });
    return;
  }

  if (data.email && existing.googleId) {
    res.status(400).json({ error: "Cannot change email after Google account is linked" });
    return;
  }

  // When changing primary email, also update the UserEmail table
  if (data.email && data.email !== existing.email) {
    const taken = await prisma.userEmail.findUnique({ where: { email: data.email } });
    if (taken && taken.userId !== id) {
      res.status(409).json({ error: "This email is already used by another user" });
      return;
    }
    // Update or create primary alias
    const primaryAlias = await prisma.userEmail.findFirst({ where: { userId: id, isPrimary: true } });
    if (primaryAlias) {
      await prisma.userEmail.update({ where: { id: primaryAlias.id }, data: { email: data.email } });
    } else {
      await prisma.userEmail.create({ data: { email: data.email, userId: id, isPrimary: true } });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    include: { emails: { orderBy: { isPrimary: "desc" } } }
  });

  if (data.role !== undefined) {
    await prisma.tenantMembership.update({
      where: { tenantId_userId: { tenantId: workspaceCtx.tenantId, userId: id } },
      data: { role: membershipRoleForInvitedGlobalRole(data.role) }
    });
  }

  if (data.name && data.name !== existing.name) {
    await logAudit(req.user!.id, "UPDATED", "USER", id, { field: "name", old: existing.name, new: data.name });
  }
  if (data.email && data.email !== existing.email) {
    await logAudit(req.user!.id, "UPDATED", "USER", id, { field: "email", old: existing.email, new: data.email });
  }
  if (data.role && data.role !== existing.role) {
    await logAudit(req.user!.id, "ROLE_CHANGED", "USER", id, { old: existing.role, new: data.role });
  }
  if (data.isActive !== undefined && data.isActive !== existing.isActive) {
    await logAudit(req.user!.id, "UPDATED", "USER", id, { field: "isActive", old: existing.isActive, new: data.isActive });
  }

  let platformRoleActivatedEmailSent = false;
  if (
    actorRole === UserRole.SUPER_ADMIN &&
    data.role !== undefined &&
    existing.role === UserRole.PENDING &&
    data.role !== UserRole.PENDING &&
    isTransactionalEmailEnabled() &&
    isTransactionalEmailReady()
  ) {
    try {
      const mail = buildE4PlatformRoleActivatedEmail({ name: existing.name || "" });
      await sendTransactionalEmail({
        to: existing.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tags: [{ name: "event", value: "E4" }],
      });
      platformRoleActivatedEmailSent = true;
      logTransactionalEmail("E4", { ok: true, userId: id });
    } catch (err) {
      console.error("[transactional-email] E4 send failed:", err);
      logTransactionalEmail("E4", { ok: false, userId: id });
    }
  }

  res.json({
    user,
    emailNotifications: { platformRoleActivatedEmailSent },
  });
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.nativeEnum(UserRole).default(UserRole.VIEWER)
});

adminRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, name, role } = parsed.data;
  /** Never assign global PENDING when creating a workspace user — use VIEWER (or higher) for normal app access. */
  const effectiveGlobalRole = role === UserRole.PENDING ? UserRole.VIEWER : role;

  const tid = await requireWorkspaceForUserAdmin(req, res);
  if (!tid) return;

  const actorRole = req.user!.role;
  if (actorRole !== UserRole.SUPER_ADMIN && effectiveGlobalRole === UserRole.SUPER_ADMIN) {
    res.status(403).json({ error: "Only SUPER_ADMIN can create SUPER_ADMIN users" });
    return;
  }

  const existingAlias = await prisma.userEmail.findUnique({ where: { email } });
  const existingUser = existingAlias || await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: effectiveGlobalRole,
      activeTenantId: tid,
      emails: { create: { email, isPrimary: true } },
    },
    include: { emails: { orderBy: { isPrimary: "desc" } } },
  });
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tid, userId: user.id } },
    create: {
      tenantId: tid,
      userId: user.id,
      role: membershipRoleForInvitedGlobalRole(effectiveGlobalRole),
    },
    update: { role: membershipRoleForInvitedGlobalRole(effectiveGlobalRole) },
  });
  await logAudit(req.user!.id, "CREATED", "USER", user.id, {
    email,
    role: effectiveGlobalRole,
    tenantId: tid,
  });
  res.status(201).json({ user });
});

/* ── User Email Aliases ───────────────────────────────────────────── */

const addEmailSchema = z.object({ email: z.string().email() });

adminRouter.post("/users/:id/emails", async (req, res) => {
  const userId = String(req.params.id);
  const parsed = addEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!(await requireTargetUserInWorkspace(req, res, userId))) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const taken = await prisma.userEmail.findUnique({ where: { email: parsed.data.email }, include: { user: { select: { id: true, name: true } } } });
  if (taken) {
    res.status(409).json({
      error: "This email is already used by another user",
      existingUserId: taken.userId,
      existingUserName: taken.user?.name ?? null
    });
    return;
  }

  const alias = await prisma.userEmail.create({
    data: { email: parsed.data.email, userId, isPrimary: false }
  });
  await logAudit(req.user!.id, "UPDATED", "USER", userId, { action: "add_alias", email: parsed.data.email });
  res.status(201).json({ email: alias });
});

adminRouter.delete("/users/:id/emails/:emailId", async (req, res) => {
  const userId = String(req.params.id);
  const emailId = String(req.params.emailId);

  if (!(await requireTargetUserInWorkspace(req, res, userId))) return;

  const alias = await prisma.userEmail.findUnique({ where: { id: emailId } });
  if (!alias || alias.userId !== userId) {
    res.status(404).json({ error: "Email alias not found" });
    return;
  }
  if (alias.isPrimary) {
    res.status(400).json({ error: "Cannot delete primary email" });
    return;
  }

  await prisma.userEmail.delete({ where: { id: emailId } });
  await logAudit(req.user!.id, "UPDATED", "USER", userId, { action: "remove_alias", email: alias.email });
  res.json({ ok: true });
});

/* ── Delete user (frees their emails so they can be added as alias elsewhere) ── */

adminRouter.delete("/users/:id", async (req, res) => {
  const id = String(req.params.id);

  if (id === req.user!.id) {
    res.status(400).json({ error: "You cannot remove yourself from this workspace" });
    return;
  }

  const tid = await requireWorkspaceForUserAdmin(req, res);
  if (!tid) return;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const removed = await prisma.tenantMembership.deleteMany({
    where: { tenantId: tid, userId: id }
  });
  if (removed.count === 0) {
    res.status(403).json({ error: "User is not a member of this workspace." });
    return;
  }

  await logAudit(req.user!.id, "UPDATED", "USER", id, {
    action: "remove_workspace_membership",
    tenantId: tid,
    email: user.email,
    name: user.name
  });
  res.json({ ok: true });
});

/* ── Audit Log ────────────────────────────────────────────────────── */

adminRouter.get("/audit", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const where: Prisma.AuditEntryWhereInput = {};
  if (typeof req.query.userId === "string") where.userId = req.query.userId;
  if (typeof req.query.entityType === "string") where.entityType = req.query.entityType;
  if (typeof req.query.action === "string" && Object.values(AuditAction).includes(req.query.action as AuditAction)) {
    where.action = req.query.action as AuditAction;
  }

  const [entries, total] = await Promise.all([
    prisma.auditEntry.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    }),
    prisma.auditEntry.count({ where })
  ]);

  res.json({ entries, total, page, limit });
});

import { AuditAction, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

export const adminRouter = Router();
adminRouter.use(requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" }
  });
  res.json({ users });
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

  if (data.role) {
    const actorRole = req.user!.role;
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

  if (data.email && existing.googleId) {
    res.status(400).json({ error: "Cannot change email after Google account is linked" });
    return;
  }

  const user = await prisma.user.update({ where: { id }, data });

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

  res.json({ user });
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

  const actorRole = req.user!.role;
  if (actorRole !== UserRole.SUPER_ADMIN && role === UserRole.SUPER_ADMIN) {
    res.status(403).json({ error: "Only SUPER_ADMIN can create SUPER_ADMIN users" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const user = await prisma.user.create({ data: { email, name, role } });
  await logAudit(req.user!.id, "CREATED", "USER", user.id, { email, role });
  res.status(201).json({ user });
});

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

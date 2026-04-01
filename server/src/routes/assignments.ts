import { AssignmentRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findFirstUserIdNotInTenant } from "../lib/tenantUserRefs.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite, requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";

const assignmentSchema = z.object({
  initiativeId: z.string().min(1),
  userId: z.string().min(1),
  role: z.nativeEnum(AssignmentRole),
  allocation: z.number().int().min(0).max(100).nullable().optional()
});

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

assignmentsRouter.get("/", async (req, res) => {
  const initiativeId = typeof req.query.initiativeId === "string" ? req.query.initiativeId : undefined;
  const assignments = await prisma.initiativeAssignment.findMany({
    where: initiativeId ? { initiativeId } : undefined,
    include: {
      user: true,
      initiative: true
    },
    orderBy: [{ initiativeId: "asc" }, { role: "asc" }]
  });
  res.json({ assignments });
});

assignmentsRouter.post("/", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = getTenantId(req);
  const outsider = await findFirstUserIdNotInTenant(tenantId, [parsed.data.userId]);
  if (outsider) {
    res.status(400).json({ error: `User is not a member of this workspace: ${outsider}` });
    return;
  }

  if (parsed.data.role === AssignmentRole.ACCOUNTABLE) {
    await prisma.initiativeAssignment.deleteMany({
      where: { initiativeId: parsed.data.initiativeId, role: AssignmentRole.ACCOUNTABLE }
    });
  }

  const assignment = await prisma.initiativeAssignment.upsert({
    where: {
      initiativeId_userId_role: {
        initiativeId: parsed.data.initiativeId,
        userId: parsed.data.userId,
        role: parsed.data.role
      }
    },
    create: {
      initiativeId: parsed.data.initiativeId,
      userId: parsed.data.userId,
      role: parsed.data.role,
      allocation: parsed.data.allocation ?? null
    },
    update: {
      allocation: parsed.data.allocation ?? null
    },
    include: { user: true }
  });

  if (parsed.data.role === AssignmentRole.ACCOUNTABLE) {
    await prisma.initiative.update({
      where: { id: parsed.data.initiativeId },
      data: { ownerId: parsed.data.userId }
    });
  }

  await logAudit(req.user!.id, "CREATED", "ASSIGNMENT", undefined, {
    initiativeId: parsed.data.initiativeId,
    userId: parsed.data.userId,
    role: parsed.data.role
  });
  res.status(201).json({ assignment });
});

const assignmentUpdateSchema = z.object({
  initiativeId: z.string().min(1),
  userId: z.string().min(1),
  role: z.nativeEnum(AssignmentRole),
  newRole: z.nativeEnum(AssignmentRole).optional(),
  allocation: z.number().int().min(0).max(100).nullable().optional()
});

assignmentsRouter.put("/", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = assignmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeId, userId, role, newRole, allocation } = parsed.data;

  const tenantId = getTenantId(req);
  const outsiderPut = await findFirstUserIdNotInTenant(tenantId, [userId]);
  if (outsiderPut) {
    res.status(400).json({ error: `User is not a member of this workspace: ${outsiderPut}` });
    return;
  }

  const existing = await prisma.initiativeAssignment.findUnique({
    where: {
      initiativeId_userId_role: { initiativeId, userId, role }
    }
  });
  if (!existing) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  if (newRole !== undefined && newRole !== role) {
    await prisma.$transaction(async (tx) => {
      await tx.initiativeAssignment.delete({
        where: { initiativeId_userId_role: { initiativeId, userId, role } }
      });
      if (role === AssignmentRole.ACCOUNTABLE) {
        await tx.initiative.update({
          where: { id: initiativeId },
          data: { ownerId: null }
        });
      }
      const assignment = await tx.initiativeAssignment.upsert({
        where: {
          initiativeId_userId_role: { initiativeId, userId, role: newRole }
        },
        create: {
          initiativeId,
          userId,
          role: newRole,
          allocation: allocation ?? existing.allocation
        },
        update: { allocation: allocation ?? existing.allocation },
        include: { user: true }
      });
      if (newRole === AssignmentRole.ACCOUNTABLE) {
        await tx.initiative.update({
          where: { id: initiativeId },
          data: { ownerId: userId }
        });
      }
      return assignment;
    });
    const updated = await prisma.initiativeAssignment.findUnique({
      where: {
        initiativeId_userId_role: { initiativeId, userId, role: newRole }
      },
      include: { user: true }
    });
    await logAudit(req.user!.id, "UPDATED", "ASSIGNMENT", undefined, {
      initiativeId,
      userId,
      fromRole: role,
      toRole: newRole
    });
    return res.json({ assignment: updated });
  }

  if (allocation !== undefined) {
    const assignment = await prisma.initiativeAssignment.update({
      where: { initiativeId_userId_role: { initiativeId, userId, role } },
      data: { allocation },
      include: { user: true }
    });
    await logAudit(req.user!.id, "UPDATED", "ASSIGNMENT", undefined, {
      initiativeId,
      userId,
      role,
      allocation
    });
    return res.json({ assignment });
  }

  res.status(400).json({ error: "Provide newRole and/or allocation to update" });
});

assignmentsRouter.delete("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = z
    .object({
      initiativeId: z.string(),
      userId: z.string(),
      role: z.nativeEnum(AssignmentRole)
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await logAudit(req.user!.id, "DELETED", "ASSIGNMENT", undefined, {
    initiativeId: parsed.data.initiativeId,
    userId: parsed.data.userId,
    role: parsed.data.role
  });
  await prisma.initiativeAssignment.delete({
    where: {
      initiativeId_userId_role: parsed.data
    }
  });

  if (parsed.data.role === AssignmentRole.ACCOUNTABLE) {
    await prisma.initiative.update({
      where: { id: parsed.data.initiativeId },
      data: { ownerId: null }
    });
  }

  res.status(204).send();
});

import { AssignmentRole, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
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

assignmentsRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
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

assignmentsRouter.delete("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
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

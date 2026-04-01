import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

const dependencySchema = z.object({
  fromInitiativeId: z.string(),
  toInitiativeId: z.string(),
  description: z.string().nullable().optional()
});

export const dependenciesRouter = Router();
dependenciesRouter.use(requireAuth);

dependenciesRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = dependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const dep = await prisma.dependency.create({
    data: {
      fromInitiativeId: parsed.data.fromInitiativeId,
      toInitiativeId: parsed.data.toInitiativeId,
      description: parsed.data.description ?? null
    }
  });
  await logAudit(req.user!.id, "CREATED", "DEPENDENCY", undefined, {
    fromInitiativeId: dep.fromInitiativeId,
    toInitiativeId: dep.toInitiativeId
  });
  res.status(201).json({ dependency: dep });
});

dependenciesRouter.delete("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = dependencySchema.pick({ fromInitiativeId: true, toInitiativeId: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await logAudit(req.user!.id, "DELETED", "DEPENDENCY", undefined, {
    fromInitiativeId: parsed.data.fromInitiativeId,
    toInitiativeId: parsed.data.toInitiativeId
  });
  await prisma.dependency.delete({
    where: {
      fromInitiativeId_toInitiativeId: {
        fromInitiativeId: parsed.data.fromInitiativeId,
        toInitiativeId: parsed.data.toInitiativeId
      }
    }
  });
  res.status(204).send();
});

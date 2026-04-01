import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findFirstUserIdNotInTenant } from "../lib/tenantUserRefs.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";

const partnerSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  ownerId: z.string().nullable().optional()
});

export const partnersRouter = Router();
partnersRouter.use(requireAuth);

partnersRouter.get("/", async (_req, res) => {
  const partners = await prisma.partner.findMany({
    include: {
      owner: true,
      demands: {
        include: {
          demandLinks: {
            include: { initiative: true, feature: true }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });
  res.json({ partners });
});

partnersRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const bad = await findFirstUserIdNotInTenant(getTenantId(req), [parsed.data.ownerId]);
  if (bad) {
    res.status(400).json({ error: `User is not a member of this workspace: ${bad}` });
    return;
  }
  const partner = await prisma.partner.create({
    data: {
      ...parsed.data,
      ownerId: parsed.data.ownerId ?? null
    }
  });
  await logAudit(req.user!.id, "CREATED", "PARTNER", partner.id, { name: partner.name });
  res.status(201).json({ partner });
});

partnersRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = partnerSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.ownerId !== undefined) {
    const bad = await findFirstUserIdNotInTenant(getTenantId(req), [parsed.data.ownerId]);
    if (bad) {
      res.status(400).json({ error: `User is not a member of this workspace: ${bad}` });
      return;
    }
  }
  const partner = await prisma.partner.update({
    where: { id },
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      ownerId: parsed.data.ownerId ?? undefined
    }
  });
  await logAudit(req.user!.id, "UPDATED", "PARTNER", id, { name: partner.name });
  res.json({ partner });
});

partnersRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.partner.findUnique({ where: { id } });
  await prisma.partner.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "PARTNER", id, { name: existing?.name });
  res.status(204).send();
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

const domainSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  sortOrder: z.number().int().default(0)
});

export const domainsRouter = Router();
domainsRouter.use(requireAuth);

domainsRouter.get("/", async (_req, res) => {
  const domains = await prisma.domain.findMany({ orderBy: { sortOrder: "asc" } });
  res.json({ domains });
});

domainsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = domainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const domain = await prisma.domain.create({ data: parsed.data });
  await logAudit(req.user!.id, "CREATED", "DOMAIN", domain.id, { name: domain.name });
  res.status(201).json({ domain });
});

domainsRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = domainSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.domain.findUnique({ where: { id } });
  const domain = await prisma.domain.update({ where: { id }, data: parsed.data });
  const changes =
    existing && (parsed.data.name !== undefined || parsed.data.color !== undefined || parsed.data.sortOrder !== undefined)
      ? [
          ...(parsed.data.name !== undefined && existing.name !== parsed.data.name ? [{ field: "name", old: existing.name, new: parsed.data.name }] : []),
          ...(parsed.data.color !== undefined && existing.color !== parsed.data.color ? [{ field: "color", old: existing.color, new: parsed.data.color }] : []),
          ...(parsed.data.sortOrder !== undefined && existing.sortOrder !== parsed.data.sortOrder ? [{ field: "sortOrder", old: existing.sortOrder, new: parsed.data.sortOrder }] : [])
        ]
      : [];
  await logAudit(req.user!.id, "UPDATED", "DOMAIN", id, changes.length ? { changes } : { name: domain.name });
  res.json({ domain });
});

domainsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.domain.findUnique({ where: { id } });
  await prisma.domain.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "DOMAIN", id, { name: existing?.name });
  res.status(204).send();
});

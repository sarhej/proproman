import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

const revenueStreamSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1)
});

export const revenueStreamsRouter = Router();
revenueStreamsRouter.use(requireAuth);

revenueStreamsRouter.get("/", async (_req, res) => {
  const revenueStreams = await prisma.revenueStream.findMany({ orderBy: { name: "asc" } });
  res.json({ revenueStreams });
});

revenueStreamsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = revenueStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const revenueStream = await prisma.revenueStream.create({ data: parsed.data });
  await logAudit(req.user!.id, "CREATED", "REVENUE_STREAM", revenueStream.id, { name: revenueStream.name });
  res.status(201).json({ revenueStream });
});

revenueStreamsRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = revenueStreamSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.revenueStream.findUnique({ where: { id } });
  const revenueStream = await prisma.revenueStream.update({ where: { id }, data: parsed.data });
  const changes =
    existing && (parsed.data.name !== undefined || parsed.data.color !== undefined)
      ? [
          ...(parsed.data.name !== undefined && existing.name !== parsed.data.name ? [{ field: "name", old: existing.name, new: parsed.data.name }] : []),
          ...(parsed.data.color !== undefined && existing.color !== parsed.data.color ? [{ field: "color", old: existing.color, new: parsed.data.color }] : [])
        ]
      : [];
  await logAudit(req.user!.id, "UPDATED", "REVENUE_STREAM", id, changes.length ? { changes } : { name: revenueStream.name });
  res.json({ revenueStream });
});

revenueStreamsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.revenueStream.findUnique({ where: { id } });
  await prisma.revenueStream.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "REVENUE_STREAM", id, { name: existing?.name });
  res.status(204).send();
});

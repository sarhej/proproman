import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { UserRole } from "@prisma/client";

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

revenueStreamsRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = revenueStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const revenueStream = await prisma.revenueStream.create({ data: parsed.data });
  res.status(201).json({ revenueStream });
});

revenueStreamsRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = revenueStreamSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const revenueStream = await prisma.revenueStream.update({ where: { id }, data: parsed.data });
  res.json({ revenueStream });
});

revenueStreamsRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.revenueStream.delete({ where: { id } });
  res.status(204).send();
});

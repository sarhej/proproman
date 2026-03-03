import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { UserRole } from "@prisma/client";

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

domainsRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = domainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const domain = await prisma.domain.create({ data: parsed.data });
  res.status(201).json({ domain });
});

domainsRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = domainSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const domain = await prisma.domain.update({ where: { id }, data: parsed.data });
  res.json({ domain });
});

domainsRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.domain.delete({ where: { id } });
  res.status(204).send();
});

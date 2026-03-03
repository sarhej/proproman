import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

partnersRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = partnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const partner = await prisma.partner.create({
    data: {
      ...parsed.data,
      ownerId: parsed.data.ownerId ?? null
    }
  });
  res.status(201).json({ partner });
});

partnersRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = partnerSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const partner = await prisma.partner.update({
    where: { id },
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      ownerId: parsed.data.ownerId ?? undefined
    }
  });
  res.json({ partner });
});

partnersRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.partner.delete({ where: { id } });
  res.status(204).send();
});

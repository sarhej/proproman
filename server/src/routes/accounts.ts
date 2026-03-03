import { AccountType, DealStage, StrategicTier, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const accountSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(AccountType),
  segment: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  arrImpact: z.number().nullable().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  dealStage: z.nativeEnum(DealStage).nullable().optional(),
  strategicTier: z.nativeEnum(StrategicTier).nullable().optional()
});

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

accountsRouter.get("/", async (_req, res) => {
  const accounts = await prisma.account.findMany({
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
  res.json({ accounts });
});

accountsRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const account = await prisma.account.create({
    data: {
      ...parsed.data,
      ownerId: parsed.data.ownerId ?? null,
      segment: parsed.data.segment ?? null,
      arrImpact: parsed.data.arrImpact ?? null,
      renewalDate: parsed.data.renewalDate ? new Date(parsed.data.renewalDate) : null,
      dealStage: parsed.data.dealStage ?? null,
      strategicTier: parsed.data.strategicTier ?? null
    }
  });
  res.status(201).json({ account });
});

accountsRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = accountSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const account = await prisma.account.update({
    where: { id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      segment: parsed.data.segment ?? undefined,
      ownerId: parsed.data.ownerId ?? undefined,
      arrImpact: parsed.data.arrImpact ?? undefined,
      renewalDate: parsed.data.renewalDate ? new Date(parsed.data.renewalDate) : parsed.data.renewalDate,
      dealStage: parsed.data.dealStage ?? undefined,
      strategicTier: parsed.data.strategicTier ?? undefined
    }
  });
  res.json({ account });
});

accountsRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.account.delete({ where: { id } });
  res.status(204).send();
});

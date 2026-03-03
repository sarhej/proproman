import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { UserRole } from "@prisma/client";

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0)
});

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      initiatives: {
        include: {
          owner: true,
          domain: true,
          personaImpacts: { include: { persona: true } },
          demandLinks: {
            include: {
              demand: {
                include: { account: true, partner: true }
              }
            }
          },
          features: {
            include: {
              owner: true,
              requirements: true,
              demandLinks: {
                include: {
                  demand: {
                    include: { account: true, partner: true }
                  }
                }
              }
            },
            orderBy: { sortOrder: "asc" }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    },
    orderBy: { sortOrder: "asc" }
  });
  res.json({ products });
});

productsRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const product = await prisma.product.create({
    data: {
      ...parsed.data,
      description: parsed.data.description ?? null
    }
  });
  res.status(201).json({ product });
});

productsRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const product = await prisma.product.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      sortOrder: parsed.data.sortOrder
    }
  });
  res.json({ product });
});

productsRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.product.delete({ where: { id } });
  res.status(204).send();
});

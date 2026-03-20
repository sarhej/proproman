import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
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
              requirements: { include: { assignee: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
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
  await logAudit(req.user!.id, "CREATED", "PRODUCT", product.id, { name: product.name });
  res.status(201).json({ product });
});

productsRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.product.findUnique({ where: { id } });
  const product = await prisma.product.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      sortOrder: parsed.data.sortOrder
    }
  });
  const changes =
    existing && (parsed.data.name !== undefined || parsed.data.description !== undefined || parsed.data.sortOrder !== undefined)
      ? [
          ...(parsed.data.name !== undefined && existing.name !== parsed.data.name ? [{ field: "name", old: existing.name, new: parsed.data.name }] : []),
          ...(parsed.data.description !== undefined && existing.description !== parsed.data.description ? [{ field: "description", old: existing.description, new: parsed.data.description }] : []),
          ...(parsed.data.sortOrder !== undefined && existing.sortOrder !== parsed.data.sortOrder ? [{ field: "sortOrder", old: existing.sortOrder, new: parsed.data.sortOrder }] : [])
        ]
      : [];
  await logAudit(req.user!.id, "UPDATED", "PRODUCT", id, changes.length ? { changes } : { name: product.name });
  res.json({ product });
});

productsRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.product.findUnique({ where: { id } });
  await prisma.product.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "PRODUCT", id, { name: existing?.name });
  res.status(204).send();
});

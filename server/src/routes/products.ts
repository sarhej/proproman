import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { TaskStatus, TopLevelItemType, UserRole } from "@prisma/client";

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  itemType: z.nativeEnum(TopLevelItemType).optional()
});

function statusCountsForProduct(initiatives: { features?: { requirements?: { status: TaskStatus }[] }[] }[]) {
  const counts: Record<TaskStatus, number> = {
    [TaskStatus.NOT_STARTED]: 0,
    [TaskStatus.IN_PROGRESS]: 0,
    [TaskStatus.TESTING]: 0,
    [TaskStatus.DONE]: 0
  };
  for (const init of initiatives) {
    for (const feat of init.features ?? []) {
      for (const req of feat.requirements ?? []) {
        counts[req.status] = (counts[req.status] ?? 0) + 1;
      }
    }
  }
  return counts;
}

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      executionBoards: {
        include: { columns: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "asc" }
      },
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
              requirements: {
                include: { assignee: true, executionColumn: true },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
              },
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
  const enriched = products.map((p) => ({
    ...p,
    requirementStatusCounts: statusCountsForProduct(p.initiatives)
  }));
  res.json({ products: enriched });
});

productsRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const product = await prisma.product.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sortOrder,
      itemType: parsed.data.itemType ?? TopLevelItemType.PRODUCT
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
      sortOrder: parsed.data.sortOrder,
      itemType: parsed.data.itemType
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

import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const metaRouter = Router();

metaRouter.use(requireAuth);

metaRouter.get("/", async (_req, res) => {
  const [domains, personas, revenueStreams, users] = await Promise.all([
    prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.persona.findMany({ orderBy: { name: "asc" } }),
    prisma.revenueStream.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } })
  ]);
  const [products, accounts, partners] = await Promise.all([
    prisma.product.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.partner.findMany({ orderBy: { name: "asc" } })
  ]);

  res.json({
    domains,
    personas,
    revenueStreams,
    users,
    products,
    accounts,
    partners
  });
});

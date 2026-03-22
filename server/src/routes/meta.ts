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
  const [features, requirements] = await Promise.all([
    prisma.feature.findMany({ select: { labels: true } }),
    prisma.requirement.findMany({ select: { labels: true } })
  ]);
  const labelSuggestions = [...features, ...requirements]
    .flatMap((item) => (Array.isArray(item.labels) ? item.labels.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : []))
    .map((label) => label.trim())
    .filter((label, index, all) => all.indexOf(label) === index)
    .sort((a, b) => a.localeCompare(b));

  res.json({
    domains,
    personas,
    revenueStreams,
    users,
    products,
    accounts,
    partners,
    labelSuggestions
  });
});

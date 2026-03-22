import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

/** Must match client `MANAGED_NAV_PATHS` (shell primary routes). */
export const MANAGED_NAV_PATHS = [
  "/",
  "/priority",
  "/raci",
  "/status-kanban",
  "/accountability",
  "/kpi-dashboard",
  "/heatmap",
  "/buyer-user",
  "/gaps",
  "/product-explorer",
  "/requirements/kanban",
  "/accounts",
  "/demands",
  "/partners",
  "/campaigns",
  "/milestones",
  "/calendar",
  "/gantt"
] as const;

const pathEnum = z.enum(MANAGED_NAV_PATHS);

const putSchema = z
  .object({
    hiddenNavPaths: z.array(pathEnum)
  })
  .refine((d) => d.hiddenNavPaths.length < MANAGED_NAV_PATHS.length, {
    message: "At least one navigation view must remain visible for non–super-admin users."
  });

export const uiSettingsRouter = Router();
uiSettingsRouter.use(requireAuth);

uiSettingsRouter.get("/", async (_req, res) => {
  const row = await prisma.uiSettings.findUnique({ where: { id: "default" } });
  const raw = row?.hiddenNavPaths;
  const hiddenNavPaths = Array.isArray(raw) ? raw.filter((p): p is (typeof MANAGED_NAV_PATHS)[number] => MANAGED_NAV_PATHS.includes(p as (typeof MANAGED_NAV_PATHS)[number])) : [];
  res.json({ hiddenNavPaths });
});

uiSettingsRouter.put("/", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { hiddenNavPaths } = parsed.data;
  const row = await prisma.uiSettings.upsert({
    where: { id: "default" },
    create: { id: "default", hiddenNavPaths },
    update: { hiddenNavPaths }
  });
  await logAudit(req.user!.id, "UPDATED", "UI_SETTINGS", "default", { hiddenNavPaths });
  res.json({ hiddenNavPaths: row.hiddenNavPaths });
});

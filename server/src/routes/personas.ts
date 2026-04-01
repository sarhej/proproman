import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";
import { PersonaCategory } from "@prisma/client";

const personaSchema = z.object({
  name: z.string().min(1),
  icon: z.string().nullable().optional(),
  category: z.nativeEnum(PersonaCategory).default(PersonaCategory.NONE)
});

export const personasRouter = Router();
personasRouter.use(requireAuth);

personasRouter.get("/", async (_req, res) => {
  const personas = await prisma.persona.findMany({ orderBy: { name: "asc" } });
  res.json({ personas });
});

personasRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = personaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const persona = await prisma.persona.create({
    data: {
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      category: parsed.data.category
    }
  });
  await logAudit(req.user!.id, "CREATED", "PERSONA", persona.id, { name: persona.name });
  res.status(201).json({ persona });
});

personasRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = personaSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.persona.findUnique({ where: { id } });
  const persona = await prisma.persona.update({
    where: { id },
    data: {
      name: parsed.data.name,
      icon: parsed.data.icon !== undefined ? (parsed.data.icon ?? null) : undefined,
      category: parsed.data.category
    }
  });
  const changes =
    existing && (parsed.data.name !== undefined || parsed.data.icon !== undefined || parsed.data.category !== undefined)
      ? [
          ...(parsed.data.name !== undefined && existing.name !== parsed.data.name ? [{ field: "name", old: existing.name, new: parsed.data.name }] : []),
          ...(parsed.data.category !== undefined && existing.category !== parsed.data.category ? [{ field: "category", old: existing.category, new: parsed.data.category }] : [])
        ]
      : [];
  await logAudit(req.user!.id, "UPDATED", "PERSONA", id, changes.length ? { changes } : { name: persona.name });
  res.json({ persona });
});

personasRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.persona.findUnique({ where: { id } });
  await prisma.persona.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "PERSONA", id, { name: existing?.name });
  res.status(204).send();
});

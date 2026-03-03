import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { PersonaCategory, UserRole } from "@prisma/client";

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

personasRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
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
  res.status(201).json({ persona });
});

personasRouter.put("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = personaSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const persona = await prisma.persona.update({
    where: { id },
    data: {
      name: parsed.data.name,
      icon: parsed.data.icon !== undefined ? (parsed.data.icon ?? null) : undefined,
      category: parsed.data.category
    }
  });
  res.json({ persona });
});

personasRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.persona.delete({ where: { id } });
  res.status(204).send();
});

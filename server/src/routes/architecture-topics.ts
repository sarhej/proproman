import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug: lowercase kebab-case");

const linksSchema = z.object({
  initiativeIds: z.array(z.string().min(1)).optional(),
  capabilityIds: z.array(z.string().min(1)).optional()
});

const architectureTopicSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(300),
  asIsSummary: z.string().nullable().optional(),
  toBeSummary: z.string().nullable().optional(),
  synonyms: z.array(z.string()).nullable().optional(),
  docPaths: z.array(z.string()).nullable().optional(),
  autoMatchCapabilities: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  ...linksSchema.shape
});

const architectureTopicUpdateSchema = architectureTopicSchema.partial().extend({
  slug: slugSchema.optional()
});

const topicInclude = {
  initiativeLinks: { include: { initiative: { select: { id: true, title: true, status: true } } } },
  capabilityLinks: { include: { capability: { select: { id: true, slug: true, title: true, status: true } } } }
} as const;

export const architectureTopicsRouter = Router();
architectureTopicsRouter.use(requireAuth);

architectureTopicsRouter.get("/", async (_req, res) => {
  const architectureTopics = await prisma.architectureTopic.findMany({
    include: topicInclude,
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
  res.json({ architectureTopics });
});

architectureTopicsRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const topic = await prisma.architectureTopic.findUnique({
    where: { id },
    include: topicInclude
  });
  if (!topic) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ architectureTopic: topic });
});

architectureTopicsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = architectureTopicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeIds, capabilityIds, synonyms, docPaths, ...rest } = parsed.data;
  try {
    const topic = await prisma.$transaction(async (tx) => {
      return tx.architectureTopic.create({
        data: {
          slug: rest.slug,
          title: rest.title,
          asIsSummary: rest.asIsSummary ?? null,
          toBeSummary: rest.toBeSummary ?? null,
          synonyms:
            synonyms === undefined ? undefined : synonyms === null ? Prisma.JsonNull : synonyms,
          docPaths: docPaths === undefined ? undefined : docPaths === null ? Prisma.JsonNull : docPaths,
          autoMatchCapabilities: rest.autoMatchCapabilities ?? true,
          sortOrder: rest.sortOrder ?? 0,
          initiativeLinks:
            initiativeIds && initiativeIds.length > 0
              ? { createMany: { data: initiativeIds.map((initiativeId) => ({ initiativeId })) } }
              : undefined,
          capabilityLinks:
            capabilityIds && capabilityIds.length > 0
              ? { createMany: { data: capabilityIds.map((capabilityId) => ({ capabilityId })) } }
              : undefined
        },
        include: topicInclude
      });
    });
    await logAudit(req.user!.id, "CREATED", "ARCHITECTURE_TOPIC", topic.id, { slug: topic.slug });
    notifyAtlasAuxiliaryChange(getTenantId(req));
    res.status(201).json({ architectureTopic: topic });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "Slug already exists in this workspace" });
      return;
    }
    throw err;
  }
});

architectureTopicsRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = architectureTopicUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeIds, capabilityIds, synonyms, docPaths, ...rest } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      if (initiativeIds !== undefined) {
        await tx.architectureTopicInitiative.deleteMany({ where: { architectureTopicId: id } });
        if (initiativeIds.length > 0) {
          await tx.architectureTopicInitiative.createMany({
            data: initiativeIds.map((initiativeId) => ({ architectureTopicId: id, initiativeId }))
          });
        }
      }
      if (capabilityIds !== undefined) {
        await tx.architectureTopicCapability.deleteMany({ where: { architectureTopicId: id } });
        if (capabilityIds.length > 0) {
          await tx.architectureTopicCapability.createMany({
            data: capabilityIds.map((capabilityId) => ({ architectureTopicId: id, capabilityId }))
          });
        }
      }
      await tx.architectureTopic.update({
        where: { id },
        data: {
          slug: rest.slug,
          title: rest.title,
          asIsSummary: rest.asIsSummary !== undefined ? rest.asIsSummary : undefined,
          toBeSummary: rest.toBeSummary !== undefined ? rest.toBeSummary : undefined,
          synonyms:
            synonyms === undefined ? undefined : synonyms === null ? Prisma.JsonNull : synonyms,
          docPaths: docPaths === undefined ? undefined : docPaths === null ? Prisma.JsonNull : docPaths,
          autoMatchCapabilities: rest.autoMatchCapabilities,
          sortOrder: rest.sortOrder
        }
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "Slug already exists in this workspace" });
      return;
    }
    throw err;
  }
  const architectureTopic = await prisma.architectureTopic.findUnique({
    where: { id },
    include: topicInclude
  });
  await logAudit(req.user!.id, "UPDATED", "ARCHITECTURE_TOPIC", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({ architectureTopic });
});

architectureTopicsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.architectureTopic.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "ARCHITECTURE_TOPIC", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});

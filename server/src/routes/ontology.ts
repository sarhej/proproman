import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BindingType, CapabilityStatus, Prisma, UserRole } from "@prisma/client";
import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import {
  compileAndStoreBriefs,
  compileBriefJson,
  compileBriefMarkdown,
  getStoredBrief,
  loadCapabilitiesForBrief,
  type BriefMode
} from "../services/ontologyBrief.js";
import { refreshGeneratedOntology } from "../services/ontologyRefresh.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root from server/src/routes */
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_EXPORT_PATH = path.join(REPO_ROOT, "context", "AGENT_BRIEF.md");

const capabilityCreateSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/, "slug: lowercase kebab-case"),
  title: z.string().min(1).max(300),
  description: z.string().nullable().optional(),
  userJob: z.string().nullable().optional(),
  synonyms: z.array(z.string()).nullable().optional(),
  doNotConfuseWith: z.string().nullable().optional(),
  status: z.nativeEnum(CapabilityStatus).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional()
});

const capabilityUpdateSchema = capabilityCreateSchema.partial().omit({ slug: true });

const bindingCreateSchema = z.object({
  capabilityId: z.string().min(1),
  bindingType: z.nativeEnum(BindingType),
  bindingKey: z.string().min(1).max(500),
  notes: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  generated: z.boolean().optional()
});

const admin = requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN);

function paramId(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return undefined;
}

/** Capability model is global in this API: reads for any authenticated user; writes for platform ADMIN/SUPER_ADMIN. */
export const ontologyRouter = Router();
ontologyRouter.use(requireAuth);

ontologyRouter.get("/capabilities", async (req, res) => {
  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  const status = statusParam && Object.values(CapabilityStatus).includes(statusParam as CapabilityStatus)
    ? (statusParam as CapabilityStatus)
    : undefined;

  const capabilities = await prisma.capability.findMany({
    where: status ? { status } : undefined,
    include: { bindings: { orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] } },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }]
  });
  res.json({ capabilities });
});

ontologyRouter.get("/capabilities/:id", async (req, res) => {
  const id = paramId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const cap = await prisma.capability.findUnique({
    where: { id },
    include: { bindings: { orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] } }
  });
  if (!cap) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ capability: cap });
});

ontologyRouter.get("/capabilities/by-slug/:slug", async (req, res) => {
  const slug = paramId(req.params.slug);
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }
  const cap = await prisma.capability.findUnique({
    where: { slug },
    include: { bindings: { orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] } }
  });
  if (!cap) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ capability: cap });
});

ontologyRouter.post("/capabilities", admin, async (req, res) => {
  const parsed = capabilityCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  try {
    const cap = await prisma.capability.create({
      data: {
        slug: body.slug,
        title: body.title,
        description: body.description ?? null,
        userJob: body.userJob ?? null,
        synonyms:
          body.synonyms === undefined
            ? undefined
            : body.synonyms === null
              ? Prisma.JsonNull
              : body.synonyms,
        doNotConfuseWith: body.doNotConfuseWith ?? null,
        status: body.status ?? CapabilityStatus.DRAFT,
        parentId: body.parentId ?? null,
        sortOrder: body.sortOrder ?? 0
      },
      include: { bindings: true }
    });
    await logAudit(req.user!.id, "CREATED", "CAPABILITY", cap.id, { slug: cap.slug });
    res.status(201).json({ capability: cap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique")) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw e;
  }
});

ontologyRouter.put("/capabilities/:id", admin, async (req, res) => {
  const capId = paramId(req.params.id);
  if (!capId) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const parsed = capabilityUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  try {
    const data: Prisma.CapabilityUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.userJob !== undefined) data.userJob = body.userJob;
    if (body.synonyms !== undefined) {
      data.synonyms = body.synonyms === null ? Prisma.JsonNull : body.synonyms;
    }
    if (body.doNotConfuseWith !== undefined) data.doNotConfuseWith = body.doNotConfuseWith;
    if (body.status !== undefined) data.status = body.status;
    if (body.parentId !== undefined) data.parent = body.parentId === null ? { disconnect: true } : { connect: { id: body.parentId } };
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const cap = await prisma.capability.update({
      where: { id: capId },
      data,
      include: { bindings: true }
    });
    await logAudit(req.user!.id, "UPDATED", "CAPABILITY", cap.id, { slug: cap.slug });
    res.json({ capability: cap });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

ontologyRouter.delete("/capabilities/:id", admin, async (req, res) => {
  const capId = paramId(req.params.id);
  if (!capId) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  try {
    await prisma.capability.delete({ where: { id: capId } });
    await logAudit(req.user!.id, "DELETED", "CAPABILITY", capId, {});
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

ontologyRouter.post("/bindings", admin, async (req, res) => {
  const parsed = bindingCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  try {
    const row = await prisma.capabilityBinding.create({
      data: {
        capabilityId: b.capabilityId,
        bindingType: b.bindingType,
        bindingKey: b.bindingKey,
        notes: b.notes ?? null,
        isPrimary: b.isPrimary ?? false,
        generated: b.generated ?? false
      }
    });
    await logAudit(req.user!.id, "CREATED", "CAPABILITY_BINDING", row.id, {
      capabilityId: b.capabilityId,
      bindingType: b.bindingType,
      bindingKey: b.bindingKey
    });
    res.status(201).json({ binding: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique")) {
      res.status(409).json({ error: "Binding already exists for this capability" });
      return;
    }
    throw e;
  }
});

ontologyRouter.delete("/bindings/:id", admin, async (req, res) => {
  const bindId = paramId(req.params.id);
  if (!bindId) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  try {
    await prisma.capabilityBinding.delete({ where: { id: bindId } });
    await logAudit(req.user!.id, "DELETED", "CAPABILITY_BINDING", bindId, {});
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

function parseBriefQuery(q: Request["query"]): { format: "md" | "json"; mode: BriefMode; useCache: boolean } {
  const format = q.format === "json" ? "json" : "md";
  const mode = q.mode === "full" ? "full" : "compact";
  const useCache = q.cached === "true" || q.cached === "1";
  return { format, mode, useCache };
}

ontologyRouter.get("/brief", async (req, res) => {
  const { format, mode, useCache } = parseBriefQuery(req.query);
  if (useCache) {
    const stored = await getStoredBrief(format, mode);
    if (stored) {
      if (format === "md") {
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.send(stored.content);
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(stored.content);
      return;
    }
  }
  const caps = await loadCapabilitiesForBrief(mode);
  if (format === "json") {
    const { content } = compileBriefJson(mode, caps);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(content);
    return;
  }
  const { content } = compileBriefMarkdown(mode, caps);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.send(content);
});

ontologyRouter.post("/compile", admin, async (req, res) => {
  void req.body;
  await compileAndStoreBriefs("compact");
  await compileAndStoreBriefs("full");
  await logAudit(req.user!.id, "CREATED", "COMPILED_BRIEF", undefined, { modes: ["compact", "full"] });
  res.json({ ok: true, message: "Stored md+json for compact and full" });
});

ontologyRouter.post("/refresh-bindings", admin, async (req, res) => {
  const result = await refreshGeneratedOntology();
  await logAudit(req.user!.id, "UPDATED", "ONTOLOGY_REFRESH", undefined, result);
  res.json({ ok: true, ...result });
});

ontologyRouter.post("/export-file", admin, async (req, res) => {
  const outPath =
    typeof req.body?.path === "string" && req.body.path.length > 0
      ? path.isAbsolute(req.body.path)
        ? req.body.path
        : path.join(REPO_ROOT, req.body.path)
      : DEFAULT_EXPORT_PATH;

  const mode: BriefMode = req.body?.mode === "full" ? "full" : "compact";
  const caps = await loadCapabilitiesForBrief(mode);
  const { content } = compileBriefMarkdown(mode, caps);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, content, "utf8");
  await compileAndStoreBriefs("compact");
  await compileAndStoreBriefs("full");
  await logAudit(req.user!.id, "CREATED", "AGENT_BRIEF_EXPORT", undefined, { path: outPath, mode });
  res.json({ ok: true, path: outPath, bytes: Buffer.byteLength(content, "utf8") });
});

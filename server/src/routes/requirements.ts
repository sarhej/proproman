import { Prisma, Priority, TaskStatus, TaskType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findFirstUserIdNotInTenant } from "../lib/tenantUserRefs.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";
import { notifyHubChange } from "../services/hubChangeHub.js";
import { executionBoardLayoutSchema, labelsSchema, requirementReorderSchema } from "./schemas.js";
import {
  applyExecutionColumn,
  nextExecutionSortOrder,
  productIdForFeature
} from "../services/requirementExecutionColumn.js";

const metadataSchema = z.record(z.unknown()).nullable().optional();

export const requirementSchema = z.object({
  featureId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.NOT_STARTED),
  isDone: z.boolean().default(false),
  priority: z.nativeEnum(Priority).default(Priority.P2),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimate: z.string().nullable().optional(),
  labels: labelsSchema,
  taskType: z.nativeEnum(TaskType).nullable().optional(),
  blockedReason: z.string().nullable().optional(),
  externalRef: z.string().nullable().optional(),
  metadata: metadataSchema,
  sortOrder: z.number().int().default(0),
  executionColumnId: z.union([z.string().min(1), z.null()]).optional()
});

export const requirementsRouter = Router();
requirementsRouter.use(requireAuth);

requirementsRouter.post("/reorder", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = requirementReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.length === 0) {
    res.status(400).json({ error: "Empty reorder payload" });
    return;
  }
  const payloadIds = parsed.data.map((u) => u.id);
  if (new Set(payloadIds).size !== payloadIds.length) {
    res.status(400).json({ error: "Duplicate requirement ids in reorder payload" });
    return;
  }
  const first = await prisma.requirement.findUnique({
    where: { id: parsed.data[0].id },
    select: { featureId: true }
  });
  if (!first) {
    res.status(400).json({ error: "Unknown requirement" });
    return;
  }
  const siblings = await prisma.requirement.findMany({
    where: { featureId: first.featureId },
    select: { id: true }
  });
  const expected = new Set(siblings.map((s) => s.id));
  if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
    res.status(400).json({ error: "Payload must list every requirement in the feature exactly once" });
    return;
  }
  await prisma.$transaction(
    parsed.data.map((u) =>
      prisma.requirement.update({
        where: { id: u.id },
        data: { sortOrder: u.sortOrder }
      })
    )
  );
  const feat = await prisma.feature.findUnique({
    where: { id: first.featureId },
    select: { initiativeId: true }
  });
  notifyHubChange({
    tenantId: getTenantId(req),
    entityType: "REQUIREMENT",
    operation: "REORDER",
    entityId: null,
    initiativeId: feat?.initiativeId ?? null
  });
  res.json({ ok: true });
});

requirementsRouter.post("/execution-layout", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = executionBoardLayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { productId, columns } = parsed.data;
  const flatIds = columns.flatMap((c) => c.requirementIds);
  if (new Set(flatIds).size !== flatIds.length) {
    res.status(400).json({ error: "Duplicate requirement ids in layout" });
    return;
  }
  const boards = await prisma.executionBoard.findMany({
    where: { productId },
    select: { columns: { select: { id: true } } }
  });
  const validColumnIds = new Set(boards.flatMap((b) => b.columns.map((c) => c.id)));
  for (const col of columns) {
    if (col.executionColumnId !== null && !validColumnIds.has(col.executionColumnId)) {
      res.status(400).json({ error: "Unknown execution column for this product" });
      return;
    }
  }
  const productReqs = await prisma.requirement.findMany({
    where: { feature: { initiative: { productId } } },
    select: { id: true, featureId: true, executionColumnId: true }
  });
  const expected = new Set(productReqs.map((r) => r.id));
  if (flatIds.length !== expected.size || !flatIds.every((id) => expected.has(id))) {
    res.status(400).json({ error: "Layout must list every requirement for this product exactly once" });
    return;
  }
  const reqById = new Map(productReqs.map((r) => [r.id, r]));
  await prisma.$transaction(async () => {
    for (const col of columns) {
      const targetColId = col.executionColumnId;
      for (let i = 0; i < col.requirementIds.length; i++) {
        const reqId = col.requirementIds[i]!;
        const row = reqById.get(reqId)!;
        const prevCol = row.executionColumnId;
        const data: Prisma.RequirementUncheckedUpdateInput = { executionSortOrder: i };
        if (prevCol !== targetColId) {
          if (targetColId === null) {
            data.executionColumnId = null;
          } else {
            const applied = await applyExecutionColumn(row.featureId, targetColId);
            data.executionColumnId = applied.executionColumnId;
            if (applied.status !== undefined) data.status = applied.status;
            if (applied.isDone !== undefined) data.isDone = applied.isDone;
          }
        }
        await prisma.requirement.update({
          where: { id: reqId },
          data
        });
      }
    }
  });
  notifyHubChange({
    tenantId: getTenantId(req),
    entityType: "REQUIREMENT",
    operation: "UPDATE",
    entityId: null,
    initiativeId: null
  });
  res.json({ ok: true });
});

requirementsRouter.get("/", async (req, res) => {
  const featureId = typeof req.query.featureId === "string" ? req.query.featureId : undefined;
  const requirements = await prisma.requirement.findMany({
    where: featureId ? { featureId } : undefined,
    include: {
      feature: {
        include: {
          initiative: true
        }
      },
      assignee: true,
      executionColumn: true
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  res.json({ requirements });
});

requirementsRouter.post("/", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = requirementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = getTenantId(req);
  const assigneeCheck = await findFirstUserIdNotInTenant(tenantId, [parsed.data.assigneeId]);
  if (assigneeCheck) {
    res.status(400).json({ error: `User is not a member of this workspace: ${assigneeCheck}` });
    return;
  }
  let columnPatch: { executionColumnId: string | null; status: TaskStatus; isDone: boolean } | null = null;
  if (parsed.data.executionColumnId !== undefined && parsed.data.executionColumnId !== null) {
    try {
      const applied = await applyExecutionColumn(parsed.data.featureId, parsed.data.executionColumnId);
      columnPatch = {
        executionColumnId: applied.executionColumnId,
        status: applied.status!,
        isDone: applied.isDone!
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "UNKNOWN_COLUMN") {
        res.status(400).json({ error: "Unknown execution column" });
        return;
      }
      if (msg === "COLUMN_PRODUCT_MISMATCH") {
        res.status(400).json({ error: "Execution column does not belong to this product" });
        return;
      }
      throw e;
    }
  }
  const newColId = columnPatch?.executionColumnId ?? parsed.data.executionColumnId ?? null;
  const productIdForNew = await productIdForFeature(parsed.data.featureId);
  const executionSortOrder =
    productIdForNew !== null ? await nextExecutionSortOrder(productIdForNew, newColId) : 0;
  const requirement = await prisma.requirement.create({
    data: {
      featureId: parsed.data.featureId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: columnPatch?.status ?? parsed.data.status,
      isDone: columnPatch?.isDone ?? parsed.data.isDone,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assigneeId: parsed.data.assigneeId ?? null,
      estimate: parsed.data.estimate ?? null,
      labels: parsed.data.labels === null ? Prisma.JsonNull : ((parsed.data.labels ?? undefined) as Prisma.InputJsonValue),
      taskType: parsed.data.taskType ?? null,
      blockedReason: parsed.data.blockedReason ?? null,
      externalRef: parsed.data.externalRef ?? null,
      metadata: parsed.data.metadata === null ? Prisma.JsonNull : ((parsed.data.metadata ?? undefined) as Prisma.InputJsonValue),
      sortOrder: parsed.data.sortOrder,
      executionSortOrder,
      executionColumnId: newColId
    },
    include: { assignee: true, executionColumn: true }
  });
  await logAudit(req.user!.id, "CREATED", "REQUIREMENT", requirement.id, { featureId: parsed.data.featureId, title: requirement.title });
  const feat = await prisma.feature.findUnique({
    where: { id: parsed.data.featureId },
    select: { initiativeId: true }
  });
  notifyHubChange({
    tenantId,
    entityType: "REQUIREMENT",
    operation: "CREATE",
    entityId: requirement.id,
    initiativeId: feat?.initiativeId ?? null
  });
  res.status(201).json({ requirement });
});

requirementsRouter.put("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = requirementSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.requirement.findUnique({
    where: { id },
    select: { featureId: true, executionColumnId: true }
  });
  if (!existing) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }
  const featureId = parsed.data.featureId ?? existing.featureId;

  if (parsed.data.assigneeId !== undefined) {
    const tenantId = getTenantId(req);
    const assigneeCheck = await findFirstUserIdNotInTenant(tenantId, [parsed.data.assigneeId]);
    if (assigneeCheck) {
      res.status(400).json({ error: `User is not a member of this workspace: ${assigneeCheck}` });
      return;
    }
  }

  const updateData: Prisma.RequirementUncheckedUpdateInput = {};
  if (parsed.data.featureId !== undefined) updateData.featureId = parsed.data.featureId;
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.isDone !== undefined) updateData.isDone = parsed.data.isDone;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.assigneeId !== undefined) updateData.assigneeId = parsed.data.assigneeId ?? null;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.estimate !== undefined) updateData.estimate = parsed.data.estimate;
  if (parsed.data.labels !== undefined) updateData.labels = parsed.data.labels === null ? Prisma.JsonNull : (parsed.data.labels as Prisma.InputJsonValue);
  if (parsed.data.taskType !== undefined) updateData.taskType = parsed.data.taskType;
  if (parsed.data.blockedReason !== undefined) updateData.blockedReason = parsed.data.blockedReason;
  if (parsed.data.externalRef !== undefined) updateData.externalRef = parsed.data.externalRef;
  if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata === null ? Prisma.JsonNull : (parsed.data.metadata as Prisma.InputJsonValue);
  if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;

  let nextExecCol: string | null | undefined;
  if (parsed.data.executionColumnId !== undefined) {
    if (parsed.data.executionColumnId === null) {
      updateData.executionColumnId = null;
      nextExecCol = null;
    } else {
      try {
        const applied = await applyExecutionColumn(featureId, parsed.data.executionColumnId);
        updateData.executionColumnId = applied.executionColumnId;
        nextExecCol = applied.executionColumnId;
        if (applied.status !== undefined) updateData.status = applied.status;
        if (applied.isDone !== undefined) updateData.isDone = applied.isDone;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "UNKNOWN_COLUMN") {
          res.status(400).json({ error: "Unknown execution column" });
          return;
        }
        if (msg === "COLUMN_PRODUCT_MISMATCH") {
          res.status(400).json({ error: "Execution column does not belong to this product" });
          return;
        }
        throw e;
      }
    }
  }
  if (nextExecCol !== undefined && nextExecCol !== existing.executionColumnId) {
    const pid = await productIdForFeature(featureId);
    if (pid) {
      updateData.executionSortOrder = await nextExecutionSortOrder(pid, nextExecCol);
    }
  }

  const requirement = await prisma.requirement.update({
    where: { id },
    data: updateData,
    include: { assignee: true, executionColumn: true }
  });
  await logAudit(req.user!.id, "UPDATED", "REQUIREMENT", id, { featureId: requirement.featureId, title: requirement.title });
  const feat = await prisma.feature.findUnique({
    where: { id: requirement.featureId },
    select: { initiativeId: true }
  });
  notifyHubChange({
    tenantId: getTenantId(req),
    entityType: "REQUIREMENT",
    operation: "UPDATE",
    entityId: id,
    initiativeId: feat?.initiativeId ?? null
  });
  res.json({ requirement });
});

requirementsRouter.delete("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.requirement.findUnique({ where: { id }, include: { feature: { select: { initiativeId: true } } } });
  await prisma.requirement.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "REQUIREMENT", id, { featureId: existing?.featureId, title: existing?.title });
  if (existing) {
    notifyHubChange({
      tenantId: getTenantId(req),
      entityType: "REQUIREMENT",
      operation: "DELETE",
      entityId: id,
      initiativeId: existing.feature.initiativeId
    });
  }
  res.status(204).send();
});

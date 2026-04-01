import { BoardProvider, BoardSyncState, Prisma, TaskStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

export const columnInputSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  mappedStatus: z.nativeEnum(TaskStatus),
  isDefault: z.boolean().default(false),
  externalRef: z.string().nullable().optional()
});

export const createBoardSchema = z.object({
  name: z.string().min(1),
  provider: z.nativeEnum(BoardProvider).default(BoardProvider.INTERNAL),
  isDefault: z.boolean().default(true),
  externalRef: z.string().nullable().optional(),
  config: z.record(z.unknown()).nullable().optional(),
  columns: z.array(columnInputSchema).min(1).optional()
});

export const updateBoardSchema = createBoardSchema.partial().omit({ columns: true }).extend({
  syncState: z.nativeEnum(BoardSyncState).optional()
});

export const updateColumnSchema = columnInputSchema.partial();

export const columnReorderSchema = z.array(
  z.object({
    id: z.string().min(1),
    sortOrder: z.number().int()
  })
);

export const executionBoardsRouter = Router();
executionBoardsRouter.use(requireAuth);

const boardInclude = {
  columns: { orderBy: { sortOrder: "asc" as const } }
} satisfies Prisma.ExecutionBoardInclude;

async function ensureSingleDefaultColumn(boardId: string, defaultColumnId: string | null) {
  if (!defaultColumnId) return;
  await prisma.executionColumn.updateMany({
    where: { boardId, id: { not: defaultColumnId } },
    data: { isDefault: false }
  });
}

/** GET /api/products/:productId/execution-boards */
executionBoardsRouter.get("/products/:productId/execution-boards", async (req, res) => {
  const productId = String(req.params.productId);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const boards = await prisma.executionBoard.findMany({
    where: { productId },
    include: boardInclude,
    orderBy: { createdAt: "asc" }
  });
  res.json({ boards });
});

/** POST /api/products/:productId/execution-boards */
executionBoardsRouter.post(
  "/products/:productId/execution-boards",
  requireWorkspaceStructureWrite(),
  async (req, res) => {
    const productId = String(req.params.productId);
    const parsed = createBoardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const { columns: colInput, ...boardFields } = parsed.data;
    const defaultColumns =
      colInput ??
      [
        { name: "Backlog", sortOrder: 0, mappedStatus: TaskStatus.NOT_STARTED, isDefault: true },
        { name: "In progress", sortOrder: 1, mappedStatus: TaskStatus.IN_PROGRESS, isDefault: false },
        { name: "Testing", sortOrder: 2, mappedStatus: TaskStatus.TESTING, isDefault: false },
        { name: "Done", sortOrder: 3, mappedStatus: TaskStatus.DONE, isDefault: false }
      ];
    const board = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.executionBoard.updateMany({
          where: { productId },
          data: { isDefault: false }
        });
      }
      const created = await tx.executionBoard.create({
        data: {
          productId,
          name: boardFields.name,
          provider: boardFields.provider,
          isDefault: boardFields.isDefault,
          externalRef: boardFields.externalRef ?? null,
          ...(boardFields.config !== undefined
            ? {
                config:
                  boardFields.config === null
                    ? Prisma.JsonNull
                    : (boardFields.config as Prisma.InputJsonValue)
              }
            : {}),
          columns: {
            create: defaultColumns.map((c) => ({
              name: c.name,
              sortOrder: c.sortOrder,
              mappedStatus: c.mappedStatus,
              isDefault: c.isDefault,
              externalRef: c.externalRef ?? null
            }))
          }
        },
        include: boardInclude
      });
      const defaultCol = created.columns.find((c) => c.isDefault);
      if (defaultCol) {
        await tx.executionColumn.updateMany({
          where: { boardId: created.id, id: { not: defaultCol.id } },
          data: { isDefault: false }
        });
      }
      return created;
    });
    await logAudit(req.user!.id, "CREATED", "EXECUTION_BOARD", board.id, { productId, name: board.name });
    res.status(201).json({ board });
  }
);

/** PUT /api/execution-boards/:boardId */
executionBoardsRouter.put("/execution-boards/:boardId", requireWorkspaceStructureWrite(), async (req, res) => {
  const boardId = String(req.params.boardId);
  const parsed = updateBoardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.executionBoard.findUnique({ where: { id: boardId } });
  if (!existing) {
    res.status(404).json({ error: "Board not found" });
    return;
  }
  const data: Prisma.ExecutionBoardUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.provider !== undefined) data.provider = parsed.data.provider;
  if (parsed.data.isDefault !== undefined) data.isDefault = parsed.data.isDefault;
  if (parsed.data.externalRef !== undefined) data.externalRef = parsed.data.externalRef;
  if (parsed.data.syncState !== undefined) data.syncState = parsed.data.syncState;
  if (parsed.data.config !== undefined) {
    data.config =
      parsed.data.config === null ? Prisma.JsonNull : (parsed.data.config as Prisma.InputJsonValue);
  }
  const board = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault === true) {
      await tx.executionBoard.updateMany({
        where: { productId: existing.productId, id: { not: boardId } },
        data: { isDefault: false }
      });
    }
    return tx.executionBoard.update({
      where: { id: boardId },
      data,
      include: boardInclude
    });
  });
  await logAudit(req.user!.id, "UPDATED", "EXECUTION_BOARD", boardId, { name: board.name });
  res.json({ board });
});

/** DELETE /api/execution-boards/:boardId */
executionBoardsRouter.delete(
  "/execution-boards/:boardId",
  requireWorkspaceStructureWrite(),
  async (req, res) => {
    const boardId = String(req.params.boardId);
    const existing = await prisma.executionBoard.findUnique({ where: { id: boardId } });
    if (!existing) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    await prisma.executionBoard.delete({ where: { id: boardId } });
    await logAudit(req.user!.id, "DELETED", "EXECUTION_BOARD", boardId, { name: existing.name });
    res.status(204).send();
  }
);

/** POST /api/execution-boards/:boardId/columns */
executionBoardsRouter.post(
  "/execution-boards/:boardId/columns",
  requireWorkspaceStructureWrite(),
  async (req, res) => {
    const boardId = String(req.params.boardId);
    const parsed = columnInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const board = await prisma.executionBoard.findUnique({ where: { id: boardId } });
    if (!board) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    const column = await prisma.$transaction(async (tx) => {
      const created = await tx.executionColumn.create({
        data: {
          boardId,
          name: parsed.data.name,
          sortOrder: parsed.data.sortOrder,
          mappedStatus: parsed.data.mappedStatus,
          isDefault: parsed.data.isDefault,
          externalRef: parsed.data.externalRef ?? null
        }
      });
      if (parsed.data.isDefault) {
        await ensureSingleDefaultColumn(boardId, created.id);
      }
      return created;
    });
    await logAudit(req.user!.id, "CREATED", "EXECUTION_COLUMN", column.id, { boardId, name: column.name });
    res.status(201).json({ column });
  }
);

/** PUT /api/execution-columns/:columnId */
executionBoardsRouter.put("/execution-columns/:columnId", requireWorkspaceStructureWrite(), async (req, res) => {
  const columnId = String(req.params.columnId);
  const parsed = updateColumnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.executionColumn.findUnique({ where: { id: columnId } });
  if (!existing) {
    res.status(404).json({ error: "Column not found" });
    return;
  }
  const column = await prisma.$transaction(async (tx) => {
    const updated = await tx.executionColumn.update({
      where: { id: columnId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.mappedStatus !== undefined && { mappedStatus: parsed.data.mappedStatus }),
        ...(parsed.data.isDefault !== undefined && { isDefault: parsed.data.isDefault }),
        ...(parsed.data.externalRef !== undefined && { externalRef: parsed.data.externalRef })
      }
    });
    if (parsed.data.isDefault === true) {
      await ensureSingleDefaultColumn(existing.boardId, columnId);
    }
    return updated;
  });
  await logAudit(req.user!.id, "UPDATED", "EXECUTION_COLUMN", columnId, { name: column.name });
  res.json({ column });
});

/** DELETE /api/execution-columns/:columnId */
executionBoardsRouter.delete(
  "/execution-columns/:columnId",
  requireWorkspaceStructureWrite(),
  async (req, res) => {
    const columnId = String(req.params.columnId);
    const existing = await prisma.executionColumn.findUnique({ where: { id: columnId } });
    if (!existing) {
      res.status(404).json({ error: "Column not found" });
      return;
    }
    await prisma.executionColumn.delete({ where: { id: columnId } });
    await logAudit(req.user!.id, "DELETED", "EXECUTION_COLUMN", columnId, { name: existing.name });
    res.status(204).send();
  }
);

/** POST /api/execution-boards/:boardId/columns/reorder */
executionBoardsRouter.post(
  "/execution-boards/:boardId/columns/reorder",
  requireWorkspaceStructureWrite(),
  async (req, res) => {
    const boardId = String(req.params.boardId);
    const parsed = columnReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const cols = await prisma.executionColumn.findMany({
      where: { boardId },
      select: { id: true }
    });
    const expected = new Set(cols.map((c) => c.id));
    const payloadIds = parsed.data.map((r) => r.id);
    if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
      res.status(400).json({ error: "Payload must list every column on the board exactly once" });
      return;
    }
    await prisma.$transaction(
      parsed.data.map((u) =>
        prisma.executionColumn.update({
          where: { id: u.id },
          data: { sortOrder: u.sortOrder }
        })
      )
    );
    res.json({ ok: true });
  }
);

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import {
  CommercialType,
  Horizon,
  InitiativeStatus,
  Prisma,
  Priority,
  TaskStatus,
  UserRole
} from "@prisma/client";
import { prisma } from "../db.js";
import { slugify } from "../lib/productSlug.js";

/**
 * Opt-in HTTP + Postgres tests. Requires valid `.env` (DATABASE_URL, SESSION_SECRET, …) and a DB
 * schema matching the current Prisma client (`npx prisma migrate deploy` from `server/`).
 *
 * Run: `npm run test:integration` (server) or `npm run test:integration` from repo root.
 */
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";

function authAs(userId: string, role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: { id: string; role: UserRole; isActive: boolean } }).user = {
      id: userId,
      role,
      isActive: true
    };
    next();
  };
}

describe.skipIf(!enabled)("execution-boards + columns + requirement column (HTTP integration)", () => {
  let suffix: string;
  let editorId: string;
  let adminId: string;
  let domainId: string;
  let productId: string;
  let featureId: string;
  let requirementId: string;
  let appEditor: express.Express;
  let appAdmin: express.Express;
  let appFull: express.Express;

  beforeAll(async () => {
    try {
      await runIntegrationFixture();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
        throw new Error(
          "[integration] Database schema is behind Prisma (missing column/table). From server/: npx prisma migrate deploy"
        );
      }
      throw e;
    }
  });

  async function runIntegrationFixture() {
    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const [{ executionBoardsRouter }, { requirementsRouter }] = await Promise.all([
      import("./execution-boards.js"),
      import("./requirements.js")
    ]);

    const editor = await prisma.user.create({
      data: {
        email: `it-board-editor-${suffix}@test.local`,
        name: "IT Board Editor",
        role: UserRole.EDITOR
      }
    });
    const admin = await prisma.user.create({
      data: {
        email: `it-board-admin-${suffix}@test.local`,
        name: "IT Board Admin",
        role: UserRole.ADMIN
      }
    });
    editorId = editor.id;
    adminId = admin.id;

    const domain = await prisma.domain.create({
      data: { name: `IT-Domain-${suffix}`, color: "#000000", sortOrder: 0 }
    });
    domainId = domain.id;

    const product = await prisma.product.create({
      data: { name: `IT-Product-${suffix}`, slug: slugify(`it-product-${suffix}`), sortOrder: 0 }
    });
    productId = product.id;

    const initiative = await prisma.initiative.create({
      data: {
        productId,
        title: "IT Initiative",
        domainId,
        priority: Priority.P1,
        horizon: Horizon.NOW,
        status: InitiativeStatus.IN_PROGRESS,
        commercialType: CommercialType.CONTRACT_ENABLER
      }
    });

    const feature = await prisma.feature.create({
      data: {
        initiativeId: initiative.id,
        title: "IT Feature",
        sortOrder: 0,
        status: "IDEA"
      }
    });
    featureId = feature.id;

    const reqRow = await prisma.requirement.create({
      data: {
        featureId,
        title: "IT Requirement",
        priority: Priority.P2,
        status: TaskStatus.NOT_STARTED,
        isDone: false
      }
    });
    requirementId = reqRow.id;

    appEditor = express();
    appEditor.use(express.json());
    appEditor.use(authAs(editorId, UserRole.EDITOR));
    appEditor.use("/api", executionBoardsRouter);

    appAdmin = express();
    appAdmin.use(express.json());
    appAdmin.use(authAs(adminId, UserRole.ADMIN));
    appAdmin.use("/api", executionBoardsRouter);

    appFull = express();
    appFull.use(express.json());
    appFull.use(authAs(editorId, UserRole.EDITOR));
    appFull.use("/api", executionBoardsRouter);
    appFull.use("/api/requirements", requirementsRouter);
  }

  afterAll(async () => {
    try {
      if (requirementId) {
        await prisma.requirement.deleteMany({ where: { id: requirementId } });
      }
      if (featureId) {
        await prisma.feature.deleteMany({ where: { id: featureId } });
      }
      if (productId) {
        await prisma.initiative.deleteMany({ where: { productId } });
        await prisma.executionBoard.deleteMany({ where: { productId } });
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      if (domainId) {
        await prisma.domain.deleteMany({ where: { id: domainId } });
      }
      if (editorId || adminId) {
        await prisma.auditEntry.deleteMany({
          where: { userId: { in: [editorId, adminId].filter(Boolean) } }
        });
        await prisma.user.deleteMany({
          where: { id: { in: [editorId, adminId].filter(Boolean) } }
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("GET /api/products/:id/execution-boards returns 404 for unknown product", async () => {
    const res = await request(appEditor).get("/api/products/nonexistent-id-xxxxxxxx/execution-boards");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("GET returns empty boards then POST creates board with default columns", async () => {
    const empty = await request(appEditor).get(`/api/products/${productId}/execution-boards`);
    expect(empty.status).toBe(200);
    expect(empty.body.boards).toEqual([]);

    const created = await request(appEditor)
      .post(`/api/products/${productId}/execution-boards`)
      .send({ name: `Sprint ${suffix}` });
    expect(created.status).toBe(201);
    expect(created.body.board).toBeTruthy();
    expect(created.body.board.name).toBe(`Sprint ${suffix}`);
    expect(created.body.board.columns.length).toBeGreaterThanOrEqual(4);

    const list = await request(appEditor).get(`/api/products/${productId}/execution-boards`);
    expect(list.status).toBe(200);
    expect(list.body.boards.length).toBe(1);
  });

  it("POST rejects invalid body", async () => {
    const res = await request(appEditor)
      .post(`/api/products/${productId}/execution-boards`)
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("POST column, PUT column, reorder, and DELETE column", async () => {
    const boardsRes = await request(appEditor).get(`/api/products/${productId}/execution-boards`);
    const boardId = boardsRes.body.boards[0].id as string;

    const col = await request(appEditor)
      .post(`/api/execution-boards/${boardId}/columns`)
      .send({
        name: "Review",
        sortOrder: 99,
        mappedStatus: TaskStatus.TESTING,
        isDefault: false
      });
    expect(col.status).toBe(201);
    const colId = col.body.column.id as string;

    const updated = await request(appEditor)
      .put(`/api/execution-columns/${colId}`)
      .send({ name: "Code review" });
    expect(updated.status).toBe(200);
    expect(updated.body.column.name).toBe("Code review");

    const allCols = await prisma.executionColumn.findMany({
      where: { boardId },
      orderBy: { sortOrder: "asc" }
    });
    const payload = allCols.map((c, i) => ({ id: c.id, sortOrder: allCols.length - 1 - i }));
    const badReorder = await request(appEditor)
      .post(`/api/execution-boards/${boardId}/columns/reorder`)
      .send(payload.slice(0, -1));
    expect(badReorder.status).toBe(400);

    const okReorder = await request(appEditor)
      .post(`/api/execution-boards/${boardId}/columns/reorder`)
      .send(payload);
    expect(okReorder.status).toBe(200);

    const del = await request(appEditor).delete(`/api/execution-columns/${colId}`);
    expect(del.status).toBe(204);
  });

  it("PUT board updates syncState", async () => {
    const boardsRes = await request(appEditor).get(`/api/products/${productId}/execution-boards`);
    const boardId = boardsRes.body.boards[0].id as string;
    const res = await request(appEditor).put(`/api/execution-boards/${boardId}`).send({
      syncState: "ERROR"
    });
    expect(res.status).toBe(200);
    expect(res.body.board.syncState).toBe("ERROR");
  });

  it("DELETE board is forbidden for EDITOR, allowed for ADMIN", async () => {
    const create = await request(appEditor)
      .post(`/api/products/${productId}/execution-boards`)
      .send({ name: `ToDelete ${suffix}`, isDefault: false });
    expect(create.status).toBe(201);
    const toDeleteId = create.body.board.id as string;

    const forbidden = await request(appEditor).delete(`/api/execution-boards/${toDeleteId}`);
    expect(forbidden.status).toBe(403);

    const ok = await request(appAdmin).delete(`/api/execution-boards/${toDeleteId}`);
    expect(ok.status).toBe(204);
  });

  it("PUT requirement with executionColumnId sets status and isDone from column mapping", async () => {
    const boardsRes = await request(appEditor).get(`/api/products/${productId}/execution-boards`);
    const boardId = boardsRes.body.boards[0].id as string;
    const cols = await prisma.executionColumn.findMany({
      where: { boardId },
      orderBy: { sortOrder: "asc" }
    });
    const doneCol = cols.find((c) => c.mappedStatus === TaskStatus.DONE);
    expect(doneCol).toBeTruthy();

    const res = await request(appFull)
      .put(`/api/requirements/${requirementId}`)
      .send({ executionColumnId: doneCol!.id });
    expect(res.status).toBe(200);
    expect(res.body.requirement.executionColumnId).toBe(doneCol!.id);
    expect(res.body.requirement.status).toBe(TaskStatus.DONE);
    expect(res.body.requirement.isDone).toBe(true);

    const cleared = await request(appFull)
      .put(`/api/requirements/${requirementId}`)
      .send({ executionColumnId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.requirement.executionColumnId).toBeNull();
  });

  it("PUT requirement rejects column from another product", async () => {
    const otherProduct = await prisma.product.create({
      data: { name: `IT-Other-${suffix}`, slug: slugify(`it-other-${suffix}`), sortOrder: 0 }
    });
    const otherBoard = await prisma.executionBoard.create({
      data: {
        productId: otherProduct.id,
        name: "Other",
        isDefault: true,
        columns: {
          create: [{ name: "X", sortOrder: 0, mappedStatus: TaskStatus.IN_PROGRESS, isDefault: true }]
        }
      },
      include: { columns: true }
    });
    const otherColId = otherBoard.columns[0]!.id;

    const res = await request(appFull)
      .put(`/api/requirements/${requirementId}`)
      .send({ executionColumnId: otherColId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/product/i);

    await prisma.executionBoard.deleteMany({ where: { productId: otherProduct.id } });
    await prisma.product.deleteMany({ where: { id: otherProduct.id } });
  });
});

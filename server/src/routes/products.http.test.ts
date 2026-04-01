import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  allocateUniqueProductSlug: vi.fn(),
  productCreate: vi.fn(),
  productFindUnique: vi.fn(),
  productFindFirst: vi.fn(),
  productUpdate: vi.fn(),
  logAudit: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    product: {
      create: hoisted.productCreate,
      findUnique: hoisted.productFindUnique,
      findFirst: hoisted.productFindFirst,
      update: hoisted.productUpdate
    }
  }
}));

vi.mock("../lib/productSlug.js", () => ({
  allocateUniqueProductSlug: hoisted.allocateUniqueProductSlug
}));

vi.mock("../services/audit.js", () => ({
  logAudit: hoisted.logAudit
}));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "acme",
    schemaName: "tenant_acme",
    membershipRole: "OWNER"
  })
}));

import { productsRouter } from "./products.js";

function authTenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: string; role: UserRole; isActive: boolean } }).user = {
    id: "u1",
    role: UserRole.ADMIN,
    isActive: true
  };
  (req as unknown as { tenantContext: object }).tenantContext = {
    tenantId: "tenant-1",
    tenantSlug: "acme",
    schemaName: "tenant_acme",
    membershipRole: "OWNER"
  };
  next();
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authTenantMiddleware);
  app.use("/api/products", productsRouter);
  return app;
}

describe("productsRouter HTTP (mocked prisma)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST creates product with allocated slug", async () => {
    hoisted.allocateUniqueProductSlug.mockResolvedValueOnce("cool-widget");
    hoisted.productCreate.mockResolvedValueOnce({
      id: "p1",
      name: "Cool Widget",
      slug: "cool-widget",
      description: null,
      sortOrder: 0,
      itemType: "PRODUCT"
    });

    const res = await request(makeApp())
      .post("/api/products")
      .send({ name: "Cool Widget" });

    expect(res.status).toBe(201);
    expect(res.body.product.slug).toBe("cool-widget");
    expect(hoisted.allocateUniqueProductSlug).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-1",
        fromName: "Cool Widget",
        explicitSlug: null
      })
    );
    expect(hoisted.productCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Cool Widget",
        slug: "cool-widget"
      })
    });
  });

  it("POST passes explicit slug to allocator", async () => {
    hoisted.allocateUniqueProductSlug.mockResolvedValueOnce("fixed-slug");
    hoisted.productCreate.mockResolvedValueOnce({
      id: "p2",
      name: "N",
      slug: "fixed-slug",
      description: null,
      sortOrder: 0,
      itemType: "PRODUCT"
    });

    const res = await request(makeApp())
      .post("/api/products")
      .send({ name: "N", slug: "fixed-slug" });

    expect(res.status).toBe(201);
    expect(hoisted.allocateUniqueProductSlug).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ explicitSlug: "fixed-slug" })
    );
  });

  it("POST rejects invalid slug with 400", async () => {
    const res = await request(makeApp()).post("/api/products").send({ name: "X", slug: "Bad_Slug" });
    expect(res.status).toBe(400);
    expect(hoisted.productCreate).not.toHaveBeenCalled();
  });

  it("PUT returns 404 when product missing", async () => {
    hoisted.productFindUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp()).put("/api/products/missing").send({ name: "Y" });
    expect(res.status).toBe(404);
  });

  it("PUT updates slug when unique in workspace", async () => {
    hoisted.productFindUnique.mockResolvedValue({
      id: "p1",
      name: "Old",
      slug: "old-slug",
      sortOrder: 0
    });
    hoisted.productFindFirst.mockResolvedValue(null);
    hoisted.productUpdate.mockResolvedValue({
      id: "p1",
      name: "Old",
      slug: "new-slug",
      sortOrder: 0
    });

    const res = await request(makeApp()).put("/api/products/p1").send({ slug: "new-slug" });

    expect(res.status).toBe(200);
    expect(res.body.product.slug).toBe("new-slug");
    expect(hoisted.productFindFirst).toHaveBeenCalled();
  });

  it("PUT returns 409 when slug taken by another product", async () => {
    hoisted.productFindUnique.mockResolvedValue({
      id: "p1",
      name: "A",
      slug: "a",
      sortOrder: 0
    });
    hoisted.productFindFirst.mockResolvedValue({ id: "p-other" });

    const res = await request(makeApp()).put("/api/products/p1").send({ slug: "taken" });

    expect(res.status).toBe(409);
    expect(hoisted.productUpdate).not.toHaveBeenCalled();
  });
});

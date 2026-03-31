import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { UserRole } from "@prisma/client";
import { provisionTenant, backfillTenantId } from "../tenant/tenantProvisioning.js";
import { createTenantSchema, schemaExists, listTenantSchemas } from "../tenant/tenantSchemaManager.js";

export const tenantsRouter = Router();

tenantsRouter.use(requireRole(UserRole.SUPER_ADMIN));

const createTenantInput = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

tenantsRouter.get("/", async (_req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: { select: { memberships: true } },
        migrationState: { select: { schemaVersion: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(tenants);
  } catch (err) {
    next(err);
  }
});

tenantsRouter.post("/", async (req, res, next) => {
  try {
    const data = createTenantInput.parse(req.body);
    const schemaName = `tenant_${data.slug.replace(/-/g, "_")}`;

    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        schemaName,
        status: "PROVISIONING",
        migrationState: {
          create: { schemaVersion: 0, status: "pending" },
        },
      },
      include: { migrationState: true },
    });

    res.status(201).json(tenant);
  } catch (err) {
    next(err);
  }
});

tenantsRouter.get("/:id", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        memberships: {
          include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
        },
        domains: true,
        migrationState: true,
      },
    });
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

const updateTenantInput = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

tenantsRouter.patch("/:id", async (req, res, next) => {
  try {
    const data = updateTenantInput.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
    });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

tenantsRouter.post("/:id/members", async (req, res, next) => {
  try {
    const data = addMemberSchema.parse(req.body);
    const membership = await prisma.tenantMembership.create({
      data: {
        tenantId: req.params.id,
        userId: data.userId,
        role: data.role,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
});

tenantsRouter.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    await prisma.tenantMembership.delete({
      where: { tenantId_userId: { tenantId: req.params.id, userId: req.params.userId } },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

tenantsRouter.post("/:id/provision", async (req, res, next) => {
  try {
    await provisionTenant(req.params.id);
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: { migrationState: true },
    });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

tenantsRouter.post("/:id/backfill", async (req, res, next) => {
  try {
    const result = await backfillTenantId(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tenantsRouter.post("/:id/create-schema", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    const exists = await schemaExists(tenant.schemaName);
    if (exists) {
      res.json({ ok: true, schemaName: tenant.schemaName, existed: true });
      return;
    }
    await createTenantSchema(tenant.schemaName);
    res.json({ ok: true, schemaName: tenant.schemaName, existed: false });
  } catch (err) {
    next(err);
  }
});

tenantsRouter.get("/schemas/list", async (_req, res, next) => {
  try {
    const schemas = await listTenantSchemas();
    res.json({ schemas });
  } catch (err) {
    next(err);
  }
});

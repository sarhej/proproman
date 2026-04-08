import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { Prisma, UserRole } from "@prisma/client";
import { provisionTenant, backfillTenantId } from "../tenant/tenantProvisioning.js";
import { createTenantSchema, schemaExists, listTenantSchemas } from "../tenant/tenantSchemaManager.js";
import { slugToSchemaName } from "../tenant/tenantSlug.js";
import { applyWorkspaceInviteSideEffects } from "../lib/workspaceInviteSideEffects.js";

export const tenantsRouter = Router();

tenantsRouter.use(requireRole(UserRole.SUPER_ADMIN));

export { slugToSchemaName };

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
    const schemaName = slugToSchemaName(data.slug);

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

const tenantSlugField = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens");

const updateTenantInput = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  slug: tenantSlugField.optional(),
});

tenantsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateTenantInput.parse(req.body);
    const id = req.params.id;

    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    if (existing.isSystem && body.status === "SUSPENDED") {
      res.status(400).json({ error: "The Tymio system workspace cannot be suspended." });
      return;
    }

    const data: { name?: string; status?: "ACTIVE" | "SUSPENDED"; slug?: string; schemaName?: string } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.status !== undefined) data.status = body.status;

    if (body.slug !== undefined && body.slug !== existing.slug) {
      if (existing.isSystem) {
        res.status(400).json({ error: "The system workspace slug cannot be changed." });
        return;
      }
      const schemaName = slugToSchemaName(body.slug);
      const taken = await prisma.tenant.findFirst({
        where: {
          id: { not: id },
          OR: [{ slug: body.slug }, { schemaName }],
        },
        select: { id: true },
      });
      if (taken) {
        res.status(409).json({ error: "That slug is already used by another workspace." });
        return;
      }
      data.slug = body.slug;
      data.schemaName = schemaName;
    }

    if (Object.keys(data).length === 0) {
      res.json(existing);
      return;
    }

    const tenant = await prisma.tenant.update({
      where: { id },
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
    const tenantId = req.params.id;
    const membership = await prisma.tenantMembership.create({
      data: {
        tenantId,
        userId: data.userId,
        role: data.role,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    await applyWorkspaceInviteSideEffects(data.userId, tenantId);
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

tenantsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    if (existing.isSystem) {
      res.status(400).json({ error: "The Tymio system workspace cannot be deleted." });
      return;
    }

    const linkedRequest = await prisma.tenantRequest.findFirst({
      where: { tenantId: id },
      select: { id: true, slug: true },
    });
    if (linkedRequest) {
      res.status(400).json({
        error:
          "Cannot delete this workspace: a registration request is still linked to it (approved team). Unlink or fix the request before deleting.",
      });
      return;
    }

    try {
      await prisma.tenant.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        res.status(400).json({
          error: "Cannot delete this workspace: it is still referenced by other records.",
        });
        return;
      }
      throw err;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

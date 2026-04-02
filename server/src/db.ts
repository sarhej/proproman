import { PrismaClient } from "@prisma/client";
import { createTenantExtension } from "./tenant/tenantPrisma.js";

const basePrisma = new PrismaClient();

export const prisma = createTenantExtension(basePrisma);

/**
 * Prisma client without tenant row scoping ($extends).
 * Use for control-plane reads (e.g. `Tenant` by slug) that must not depend on request tenant context.
 */
export const prismaUnscoped = basePrisma;

export type ExtendedPrismaClient = typeof prisma;

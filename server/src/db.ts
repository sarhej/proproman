import { PrismaClient } from "@prisma/client";
import { createTenantExtension } from "./tenant/tenantPrisma.js";

const basePrisma = new PrismaClient();

export const prisma = createTenantExtension(basePrisma);

export type ExtendedPrismaClient = typeof prisma;

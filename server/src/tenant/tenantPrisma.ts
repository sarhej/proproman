import { PrismaClient } from "@prisma/client";
import { getTenantContext } from "./tenantContext.js";

/**
 * Models that carry a tenantId column and must be scoped automatically.
 * Keep in sync with the Prisma schema — every model with a `tenantId` field.
 */
export const TENANT_SCOPED_MODELS = new Set([
  "Product",
  "ExecutionBoard",
  "ExecutionColumn",
  "Domain",
  "Persona",
  "RevenueStream",
  "Initiative",
  "SuccessCriterion",
  "InitiativeComment",
  "Feature",
  "Requirement",
  "Decision",
  "Risk",
  "Account",
  "Partner",
  "Demand",
  "DemandLink",
  "InitiativeAssignment",
  "Campaign",
  "Asset",
  "CampaignLink",
  "InitiativeMilestone",
  "InitiativeKPI",
  "Stakeholder",
  "AuditEntry",
  "UserMessage",
  "NotificationRule",
  "UserNotificationSubscription",
  "UserNotificationPreference",
  "NotificationDelivery",
]);

function isTenantScoped(model: string): boolean {
  return TENANT_SCOPED_MODELS.has(model);
}

type AnyArgs = Record<string, unknown>;

function injectTenantWhere(args: AnyArgs, tenantId: string): AnyArgs {
  return { ...args, where: { ...(args.where as object ?? {}), tenantId } };
}

function injectTenantData(args: AnyArgs, tenantId: string): AnyArgs {
  return { ...args, data: { ...(args.data as object ?? {}), tenantId } };
}

/**
 * Create a Prisma client extension that auto-injects tenantId
 * from AsyncLocalStorage into queries on tenant-scoped models.
 *
 * Uses Prisma client extensions ($extends) which is the supported API
 * in Prisma 5+/6+ (the old $use middleware is deprecated).
 */
export function createTenantExtension(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          const result = await query(args);
          if (model && isTenantScoped(model) && result) {
            const ctx = getTenantContext();
            if (ctx && (result as Record<string, unknown>).tenantId !== ctx.tenantId) {
              return null;
            }
          }
          return result;
        },
        async create({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantData(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) {
              const a = args as AnyArgs;
              if (Array.isArray(a.data)) {
                a.data = a.data.map((d: Record<string, unknown>) => ({ ...d, tenantId: ctx.tenantId }));
              } else {
                a.data = { ...(a.data as object), tenantId: ctx.tenantId };
              }
              args = a as typeof args;
            }
          }
          return query(args);
        },
        async update({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) {
              args = injectTenantData(args as AnyArgs, ctx.tenantId) as typeof args;
            }
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) {
              const a = injectTenantWhere(args as AnyArgs, ctx.tenantId);
              a.data = { ...(a.data as object ?? {}), tenantId: ctx.tenantId };
              args = a as typeof args;
            }
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async groupBy({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) args = injectTenantWhere(args as AnyArgs, ctx.tenantId) as typeof args;
          }
          return query(args);
        },
        async upsert({ model, args, query }) {
          if (model && isTenantScoped(model)) {
            const ctx = getTenantContext();
            if (ctx) {
              const a = args as AnyArgs;
              a.where = { ...(a.where as object ?? {}), tenantId: ctx.tenantId };
              a.create = { ...(a.create as object ?? {}), tenantId: ctx.tenantId };
              a.update = { ...(a.update as object ?? {}), tenantId: ctx.tenantId };
              args = a as typeof args;
            }
          }
          return query(args);
        },
      },
    },
  });
}

/**
 * @deprecated Use createTenantExtension instead.
 * Kept as a no-op for backward compatibility during migration.
 */
export function registerTenantMiddleware(_prisma: PrismaClient): void {
  // No-op: tenant scoping is now done via client extensions.
  // The extended client is created in db.ts
}

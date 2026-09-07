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
  "UseCase",
  "SecurityTopic",
  "ArchitectureTopic",
  "AtlasCuratorProposal",
  "RepositoryConnection",
  "GitActivity",
  "WorkArtifactLink",
  "DesignArtifactLink",
  "Release",
  "Attachment",
  "AttachmentLink",
  "AttachmentBackupJob",
  "IntakeSession"
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
 * findUnique tenant check: if the caller used a narrow `select` that omits `tenantId`,
 * temporarily include it so we can verify ownership (otherwise `undefined !== tenantId`
 * falsely returns null — broke tymio_update_requirement / PUT requirements).
 */
export function prepareFindUniqueArgsForTenantCheck(args: AnyArgs): {
  args: AnyArgs;
  stripTenantIdFromResult: boolean;
} {
  const select = args.select;
  if (!select || typeof select !== "object" || Array.isArray(select)) {
    return { args, stripTenantIdFromResult: false };
  }
  const selectObj = select as Record<string, unknown>;
  if (selectObj.tenantId) {
    return { args, stripTenantIdFromResult: false };
  }
  return {
    args: { ...args, select: { ...selectObj, tenantId: true } },
    stripTenantIdFromResult: true
  };
}

export function filterFindUniqueResultForTenant(
  result: Record<string, unknown> | null | undefined,
  tenantId: string,
  stripTenantIdFromResult: boolean
): Record<string, unknown> | null {
  if (!result) return null;
  if (result.tenantId !== tenantId) return null;
  if (!stripTenantIdFromResult) return result;
  const { tenantId: _omit, ...rest } = result;
  return rest;
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
          if (!model || !isTenantScoped(model)) {
            return query(args);
          }
          const ctx = getTenantContext();
          if (!ctx) {
            return query(args);
          }
          const prepared = prepareFindUniqueArgsForTenantCheck(args as AnyArgs);
          const result = await query(prepared.args as typeof args);
          return filterFindUniqueResultForTenant(
            result as Record<string, unknown> | null,
            ctx.tenantId,
            prepared.stripTenantIdFromResult
          ) as typeof result;
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
export function registerTenantMiddleware(prismaClient: PrismaClient): void {
  void prismaClient;
  // No-op: tenant scoping is now done via client extensions.
  // The extended client is created in db.ts
}

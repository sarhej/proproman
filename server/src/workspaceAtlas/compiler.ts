import fs from "node:fs/promises";
import path from "node:path";
import type { Dependency, Domain, Feature, Initiative, Product, Requirement } from "@prisma/client";
import { prisma } from "../db.js";
import { WORKSPACE_ATLAS_SCHEMA_VERSION } from "./constants.js";
import { workspaceAtlasMetrics } from "./metrics.js";
import { ensureTenantAtlasDirs, tenantAtlasDir } from "./paths.js";
import { writeObjectShard, writeWorkspaceAtlas } from "./store.js";
import type { ObjectShard, WorkspaceAtlas } from "./zodSchemas.js";

function toPlain<T>(value: T): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v))
  ) as Record<string, unknown>;
}

function maxIsoTime(dates: (Date | null | undefined)[]): string {
  let max = 0;
  for (const d of dates) {
    if (d && d.getTime() > max) max = d.getTime();
  }
  return new Date(max || Date.now()).toISOString();
}

function initiativeEdges(initiative: Initiative & { outgoingDeps: Dependency[]; incomingDeps: Dependency[] }) {
  const edges: ObjectShard["graph"]["edges"] = [];
  for (const d of initiative.outgoingDeps) {
    edges.push({
      kind: "initiative_depends_on",
      targetType: "INITIATIVE",
      targetId: d.toInitiativeId
    });
  }
  for (const d of initiative.incomingDeps) {
    edges.push({
      kind: "initiative_required_by",
      targetType: "INITIATIVE",
      targetId: d.fromInitiativeId
    });
  }
  return edges;
}

async function cleanupRemovedShards(
  tenantId: string,
  dirName: "DOMAIN" | "PRODUCT" | "INITIATIVE" | "FEATURE" | "REQUIREMENT",
  keepIds: Set<string>
): Promise<void> {
  const dir = path.join(tenantAtlasDir(tenantId), "objects", dirName);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw e;
  }
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const id = name.replace(/\.json$/i, "");
    if (!keepIds.has(id)) {
      await fs.unlink(path.join(dir, name));
    }
  }
}

export async function compileWorkspaceAtlasForTenant(tenantId: string): Promise<void> {
  const started = Date.now();
  workspaceAtlasMetrics.rebuildTotal += 1;
  workspaceAtlasMetrics.lastRebuildTenantId = tenantId;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true }
    });
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const [domains, products, initiatives, features, requirements] = await Promise.all([
      prisma.domain.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      prisma.product.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      prisma.initiative.findMany({
        where: { tenantId },
        include: {
          outgoingDeps: true,
          incomingDeps: true,
          domain: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, slug: true } },
          owner: { select: { id: true, name: true, email: true } }
        },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
      }),
      prisma.feature.findMany({
        where: { tenantId },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          initiative: {
            select: {
              id: true,
              title: true,
              domainId: true,
              productId: true
            }
          }
        },
        orderBy: [{ initiativeId: "asc" }, { sortOrder: "asc" }, { title: "asc" }]
      }),
      prisma.requirement.findMany({
        where: { tenantId },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          feature: {
            select: {
              id: true,
              title: true,
              initiativeId: true
            }
          }
        },
        orderBy: [{ featureId: "asc" }, { sortOrder: "asc" }, { title: "asc" }]
      })
    ]);

    const materializedAt = new Date().toISOString();
    // Domain rows have no updatedAt in Prisma; use other entities for "freshness" signal.
    const sourceMaxUpdatedAt = maxIsoTime([
      ...products.map((p) => p.updatedAt),
      ...initiatives.map((i) => i.updatedAt),
      ...features.map((f) => f.updatedAt),
      ...requirements.map((r) => r.updatedAt)
    ]);

    await ensureTenantAtlasDirs(tenantId);

    const nowProv = (sourceUpdatedAt: string): ObjectShard["provenance"] => ({
      sourceUpdatedAt,
      materializedAt,
      derivation: "hub-api"
    });

    for (const d of domains) {
      const shard: ObjectShard = {
        schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
        objectType: "DOMAIN",
        id: d.id,
        tenantId,
        workspaceSlug: tenant.slug,
        facts: toPlain(d),
        graph: {
          links: {},
          edges: []
        },
        provenance: nowProv(materializedAt)
      };
      await writeObjectShard(tenantId, shard);
    }

    for (const p of products) {
      const shard: ObjectShard = {
        schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
        objectType: "PRODUCT",
        id: p.id,
        tenantId,
        workspaceSlug: tenant.slug,
        facts: toPlain(p),
        graph: {
          links: {},
          edges: []
        },
        provenance: nowProv(p.updatedAt.toISOString())
      };
      await writeObjectShard(tenantId, shard);
    }

    for (const initiative of initiatives) {
      const { outgoingDeps, incomingDeps, domain, product, owner, ...rest } = initiative;
      void outgoingDeps;
      void incomingDeps;
      const facts = toPlain(rest) as Record<string, unknown>;
      facts.domain = domain ? toPlain(domain) : null;
      facts.product = product ? toPlain(product) : null;
      facts.owner = owner ? toPlain(owner) : null;

      const shard: ObjectShard = {
        schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
        objectType: "INITIATIVE",
        id: initiative.id,
        tenantId,
        workspaceSlug: tenant.slug,
        facts,
        graph: {
          links: {
            domainId: initiative.domainId,
            productId: initiative.productId
          },
          edges: initiativeEdges(initiative)
        },
        provenance: nowProv(initiative.updatedAt.toISOString())
      };
      await writeObjectShard(tenantId, shard);
    }

    for (const feature of features) {
      const { initiative, owner, ...rest } = feature;
      const facts = toPlain(rest) as Record<string, unknown>;
      facts.initiative = initiative ? toPlain(initiative) : null;
      facts.owner = owner ? toPlain(owner) : null;

      const shard: ObjectShard = {
        schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
        objectType: "FEATURE",
        id: feature.id,
        tenantId,
        workspaceSlug: tenant.slug,
        facts,
        graph: {
          links: {
            initiativeId: feature.initiativeId,
            domainId: initiative?.domainId ?? null,
            productId: initiative?.productId ?? null
          },
          edges: []
        },
        provenance: nowProv(feature.updatedAt.toISOString())
      };
      await writeObjectShard(tenantId, shard);
    }

    for (const req of requirements) {
      const { feature, assignee, ...rest } = req;
      const facts = toPlain(rest) as Record<string, unknown>;
      facts.feature = feature ? toPlain(feature) : null;
      facts.assignee = assignee ? toPlain(assignee) : null;

      const shard: ObjectShard = {
        schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
        objectType: "REQUIREMENT",
        id: req.id,
        tenantId,
        workspaceSlug: tenant.slug,
        facts,
        graph: {
          links: {
            featureId: req.featureId,
            initiativeId: feature?.initiativeId ?? null
          },
          edges: []
        },
        provenance: nowProv(req.updatedAt.toISOString())
      };
      await writeObjectShard(tenantId, shard);
    }

    const atlas: WorkspaceAtlas = {
      schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
      tenantId,
      workspaceSlug: tenant.slug,
      materializedAt,
      sourceMaxUpdatedAt,
      domains: domains.map((d: Domain) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        sortOrder: d.sortOrder
      })),
      products: products.map((p: Product) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sortOrder: p.sortOrder
      })),
      initiativeIndex: initiatives.map((i: Initiative) => ({
        id: i.id,
        title: i.title,
        domainId: i.domainId,
        productId: i.productId,
        status: i.status,
        horizon: i.horizon,
        priority: i.priority,
        archivedAt: i.archivedAt ? i.archivedAt.toISOString() : null
      })),
      featureIndex: features.map((f: Feature) => ({
        id: f.id,
        title: f.title,
        initiativeId: f.initiativeId,
        status: f.status
      })),
      requirementIndex: requirements.map((r: Requirement) => ({
        id: r.id,
        title: r.title,
        featureId: r.featureId,
        status: r.status
      })),
      objectCounts: {
        domain: domains.length,
        product: products.length,
        initiative: initiatives.length,
        feature: features.length,
        requirement: requirements.length
      },
      capabilityOntology: {
        kind: "pointer",
        note:
          "Capability ontology describes hub affordances (routes, MCP tools), not backlog Features. Call tymio_get_agent_brief or tymio_list_capabilities for live data.",
        mcpTools: ["tymio_get_agent_brief", "tymio_list_capabilities", "tymio_get_capability"]
      },
      backlogOntology: {
        kind: "reference",
        spine: "Domain -> Initiative <- Product; Initiative -> Feature -> Requirement",
        doc: ".cursor/skills/tymio-workspace/references/tymio-hub-ontology.md"
      }
    };

    await writeWorkspaceAtlas(tenantId, atlas);

    await Promise.all([
      cleanupRemovedShards(tenantId, "DOMAIN", new Set(domains.map((d) => d.id))),
      cleanupRemovedShards(tenantId, "PRODUCT", new Set(products.map((p) => p.id))),
      cleanupRemovedShards(tenantId, "INITIATIVE", new Set(initiatives.map((i) => i.id))),
      cleanupRemovedShards(tenantId, "FEATURE", new Set(features.map((f) => f.id))),
      cleanupRemovedShards(tenantId, "REQUIREMENT", new Set(requirements.map((r) => r.id)))
    ]);

    workspaceAtlasMetrics.lastRebuildAt = new Date().toISOString();
    workspaceAtlasMetrics.lastErrorMessage = null;
    console.log(
      `[workspace-atlas] compiled tenant=${tenant.slug} in ${Date.now() - started}ms (objects=${atlas.objectCounts.initiative} inits, ${atlas.objectCounts.feature} features)`
    );
  } catch (err) {
    workspaceAtlasMetrics.rebuildErrors += 1;
    workspaceAtlasMetrics.lastErrorMessage = err instanceof Error ? err.message : String(err);
    console.error("[workspace-atlas] compile failed:", err);
    throw err;
  }
}

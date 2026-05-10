import { z } from "zod";
import { WORKSPACE_ATLAS_SCHEMA_VERSION } from "./constants.js";

const isoDateTime = z.string().min(1);

/** Compact SDLC indices (token-controlled); optional for backward compatibility when reading older atlas files. */
export const workspaceAtlasAuxiliaryIndexSchema = z
  .object({
    useCases: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        primaryActor: z.string().nullable().optional()
      })
    ),
    securityTopics: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        category: z.string(),
        status: z.string()
      })
    ),
    releases: z.array(
      z.object({
        id: z.string(),
        tag: z.string(),
        name: z.string(),
        releasedAt: isoDateTime.nullable().optional()
      })
    ),
    repositoryConnections: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        label: z.string()
      })
    ),
    workArtifactLinks: z.array(
      z.object({
        id: z.string(),
        artifactType: z.string(),
        url: z.string(),
        featureId: z.string().nullable().optional(),
        requirementId: z.string().nullable().optional()
      })
    ),
    designArtifactLinks: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        url: z.string(),
        featureId: z.string().nullable().optional(),
        requirementId: z.string().nullable().optional()
      })
    )
  })
  .strict();

export const workspaceAtlasSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_ATLAS_SCHEMA_VERSION),
    tenantId: z.string().min(1),
    workspaceSlug: z.string().min(1),
    materializedAt: isoDateTime,
    sourceMaxUpdatedAt: isoDateTime,
    domains: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        sortOrder: z.number().int()
      })
    ),
    products: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        sortOrder: z.number().int()
      })
    ),
    initiativeIndex: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        domainId: z.string(),
        productId: z.string().nullable().optional(),
        status: z.string(),
        horizon: z.string(),
        priority: z.string(),
        archivedAt: isoDateTime.nullable().optional()
      })
    ),
    featureIndex: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        initiativeId: z.string(),
        status: z.string()
      })
    ),
    requirementIndex: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        featureId: z.string(),
        status: z.string()
      })
    ),
    objectCounts: z.object({
      domain: z.number().int().nonnegative(),
      product: z.number().int().nonnegative(),
      initiative: z.number().int().nonnegative(),
      feature: z.number().int().nonnegative(),
      requirement: z.number().int().nonnegative()
    }),
    capabilityOntology: z.object({
      kind: z.literal("pointer"),
      note: z.string(),
      mcpTools: z.array(z.string()).optional()
    }),
    backlogOntology: z.object({
      kind: z.literal("reference"),
      spine: z.string(),
      doc: z.string().optional()
    }),
    auxiliaryIndex: workspaceAtlasAuxiliaryIndexSchema.optional()
  })
  .strict();

export type WorkspaceAtlas = z.infer<typeof workspaceAtlasSchema>;

export const objectShardObjectType = z.enum([
  "DOMAIN",
  "PRODUCT",
  "INITIATIVE",
  "FEATURE",
  "REQUIREMENT"
]);

export const objectShardSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_ATLAS_SCHEMA_VERSION),
    objectType: objectShardObjectType,
    id: z.string().min(1),
    tenantId: z.string().min(1),
    workspaceSlug: z.string().min(1),
    facts: z.record(z.unknown()),
    graph: z.object({
      links: z.record(z.unknown()),
      edges: z.array(
        z.object({
          kind: z.string(),
          targetType: z.string().optional(),
          targetId: z.string().optional()
        })
      )
    }),
    summary: z.string().nullable().optional(),
    provenance: z.object({
      sourceUpdatedAt: isoDateTime,
      materializedAt: isoDateTime,
      derivation: z.enum(["hub-api", "hub-api+llm-summary"])
    })
  })
  .strict();

export type ObjectShard = z.infer<typeof objectShardSchema>;

export function parseWorkspaceAtlas(data: unknown): WorkspaceAtlas {
  return workspaceAtlasSchema.parse(data);
}

export function parseObjectShard(data: unknown): ObjectShard {
  return objectShardSchema.parse(data);
}

import type {
  ArchitectureTopic,
  Capability,
  CapabilityBinding,
  CapabilityStatus,
  Feature,
  Initiative,
  Requirement
} from "@prisma/client";
import { prisma } from "../db.js";
import { loadCapabilitiesForBrief } from "../services/ontologyBrief.js";
import { readRepoDocExcerpt } from "./docExcerpt.js";
import { WORKSPACE_ATLAS_SCHEMA_VERSION } from "./constants.js";
import type { ObjectShard } from "./zodSchemas.js";

export type ArchitectureTopicWithLinks = ArchitectureTopic & {
  initiativeLinks: Array<{ initiative: Pick<Initiative, "id" | "title" | "status" | "horizon" | "priority"> }>;
  capabilityLinks: Array<{ capability: Pick<Capability, "id" | "slug" | "title" | "status"> }>;
};

export type ArchitectureTopicCompiledLayers = {
  asIs: {
    summary: string | null;
    capabilities: Array<{
      id: string;
      slug: string;
      title: string;
      status: CapabilityStatus;
      matchReason: "linked" | "keyword";
      bindings: Array<Pick<CapabilityBinding, "bindingType" | "bindingKey" | "isPrimary" | "notes">>;
    }>;
    docExcerpts: Array<{ ref: string; path: string; anchor: string | null; excerpt: string; error?: string }>;
  };
  toBe: {
    summary: string | null;
    initiatives: Array<{
      id: string;
      title: string;
      status: string;
      horizon: string;
      priority: string;
      linkReason: "linked" | "keyword";
    }>;
    features: Array<{ id: string; title: string; status: string; initiativeId: string }>;
    requirements: Array<{ id: string; title: string; status: string; featureId: string }>;
    deliveryRollup: {
      initiatives: number;
      features: number;
      requirements: number;
      requirementByStatus: Record<string, number>;
    };
  };
  gaps: string[];
};

function parseStringArray(json: unknown): string[] {
  if (json == null) return [];
  if (Array.isArray(json)) return json.map(String).filter((s) => s.trim().length > 0);
  if (typeof json === "string") return [json];
  return [];
}

function keywordSet(topic: ArchitectureTopic): Set<string> {
  const words = new Set<string>();
  const add = (s: string) => {
    for (const part of s.toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 3) words.add(part);
    }
  };
  add(topic.slug);
  add(topic.title);
  for (const s of parseStringArray(topic.synonyms)) add(s);
  return words;
}

function textMatchesKeywords(text: string, keywords: Set<string>): boolean {
  const t = text.toLowerCase();
  for (const k of keywords) {
    if (t.includes(k)) return true;
  }
  return false;
}

function formatSynonyms(synonyms: unknown): string {
  if (synonyms == null) return "";
  if (Array.isArray(synonyms)) return synonyms.map(String).join(" ");
  return String(synonyms);
}

export async function compileArchitectureTopicLayers(
  topic: ArchitectureTopicWithLinks,
  backlog: {
    initiatives: Initiative[];
    features: Feature[];
    requirements: Requirement[];
  }
): Promise<ArchitectureTopicCompiledLayers> {
  const keywords = keywordSet(topic);
  const docRefs = parseStringArray(topic.docPaths);

  const docExcerpts = await Promise.all(
    docRefs.map(async (ref) => {
      const d = await readRepoDocExcerpt(ref);
      return { ref, path: d.path, anchor: d.anchor, excerpt: d.excerpt, error: d.error };
    })
  );

  const linkedCapIds = new Set(topic.capabilityLinks.map((l) => l.capability.id));
  const allCaps = await loadCapabilitiesForBrief("full");

  const capabilities: ArchitectureTopicCompiledLayers["asIs"]["capabilities"] = [];
  const capSeen = new Set<string>();

  const pushCap = (
    cap: Capability & { bindings: CapabilityBinding[] },
    matchReason: "linked" | "keyword"
  ) => {
    if (capSeen.has(cap.id)) return;
    capSeen.add(cap.id);
    capabilities.push({
      id: cap.id,
      slug: cap.slug,
      title: cap.title,
      status: cap.status,
      matchReason,
      bindings: cap.bindings.map((b) => ({
        bindingType: b.bindingType,
        bindingKey: b.bindingKey,
        isPrimary: b.isPrimary,
        notes: b.notes
      }))
    });
  };

  for (const link of topic.capabilityLinks) {
    const full = allCaps.find((c) => c.id === link.capability.id);
    if (full) pushCap(full, "linked");
  }

  if (topic.autoMatchCapabilities) {
    for (const cap of allCaps) {
      if (cap.status !== "ACTIVE" && cap.status !== "DRAFT") continue;
      const hay = `${cap.slug} ${cap.title} ${formatSynonyms(cap.synonyms)}`;
      if (textMatchesKeywords(hay, keywords)) pushCap(cap, "keyword");
    }
  }

  const linkedInitIds = new Set(topic.initiativeLinks.map((l) => l.initiative.id));
  const initiatives: ArchitectureTopicCompiledLayers["toBe"]["initiatives"] = [];

  for (const link of topic.initiativeLinks) {
    const i = link.initiative;
    initiatives.push({
      id: i.id,
      title: i.title,
      status: i.status,
      horizon: i.horizon,
      priority: i.priority,
      linkReason: "linked"
    });
  }

  for (const i of backlog.initiatives) {
    if (linkedInitIds.has(i.id)) continue;
    if (textMatchesKeywords(`${i.title} ${i.description ?? ""}`, keywords)) {
      initiatives.push({
        id: i.id,
        title: i.title,
        status: i.status,
        horizon: i.horizon,
        priority: i.priority,
        linkReason: "keyword"
      });
    }
  }

  const initiativeIds = new Set(initiatives.map((i) => i.id));
  const features = backlog.features
    .filter((f) => initiativeIds.has(f.initiativeId))
    .map((f) => ({ id: f.id, title: f.title, status: f.status, initiativeId: f.initiativeId }));

  const featureIds = new Set(features.map((f) => f.id));
  const requirements = backlog.requirements
    .filter((r) => featureIds.has(r.featureId))
    .map((r) => ({ id: r.id, title: r.title, status: r.status, featureId: r.featureId }));

  const requirementByStatus: Record<string, number> = {};
  for (const r of requirements) {
    requirementByStatus[r.status] = (requirementByStatus[r.status] ?? 0) + 1;
  }

  const gaps: string[] = [];
  if (!topic.asIsSummary?.trim() && docExcerpts.every((d) => !d.excerpt.trim())) {
    gaps.push("No human as-is summary and no readable doc excerpts — add asIsSummary or docPaths.");
  }
  if (capabilities.length === 0) {
    gaps.push("No linked or keyword-matched capabilities — link capabilities or add synonyms.");
  }
  if (initiatives.length === 0) {
    gaps.push("No linked or keyword-matched initiatives for to-be delivery.");
  }
  const notStarted = requirementByStatus.NOT_STARTED ?? 0;
  const total = requirements.length;
  if (total > 0 && notStarted === total) {
    gaps.push("All linked requirements are NOT_STARTED — delivery not started.");
  }

  return {
    asIs: {
      summary: topic.asIsSummary,
      capabilities,
      docExcerpts
    },
    toBe: {
      summary: topic.toBeSummary,
      initiatives,
      features,
      requirements,
      deliveryRollup: {
        initiatives: initiatives.length,
        features: features.length,
        requirements: requirements.length,
        requirementByStatus
      }
    },
    gaps
  };
}

export function buildArchitectureTopicShard(
  topic: ArchitectureTopicWithLinks,
  workspaceSlug: string,
  layers: ArchitectureTopicCompiledLayers,
  provenance: ObjectShard["provenance"]
): ObjectShard {
  return {
    schemaVersion: WORKSPACE_ATLAS_SCHEMA_VERSION,
    objectType: "ARCHITECTURE_TOPIC",
    id: topic.id,
    tenantId: topic.tenantId ?? "",
    workspaceSlug,
    facts: {
      id: topic.id,
      tenantId: topic.tenantId,
      slug: topic.slug,
      title: topic.title,
      asIsSummary: topic.asIsSummary,
      toBeSummary: topic.toBeSummary,
      synonyms: topic.synonyms,
      docPaths: topic.docPaths,
      autoMatchCapabilities: topic.autoMatchCapabilities,
      sortOrder: topic.sortOrder,
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
      layers
    },
    graph: {
      links: {
        initiativeIds: layers.toBe.initiatives.map((i) => i.id),
        capabilityIds: layers.asIs.capabilities.map((c) => c.id)
      },
      edges: layers.toBe.initiatives.map((i) => ({
        kind: "topic_to_initiative",
        targetType: "INITIATIVE",
        targetId: i.id
      }))
    },
    provenance
  };
}

export async function loadArchitectureTopicsForTenant(tenantId: string): Promise<ArchitectureTopicWithLinks[]> {
  return prisma.architectureTopic.findMany({
    where: { tenantId },
    include: {
      initiativeLinks: {
        include: {
          initiative: {
            select: { id: true, title: true, status: true, horizon: true, priority: true }
          }
        }
      },
      capabilityLinks: {
        include: {
          capability: { select: { id: true, slug: true, title: true, status: true } }
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
}

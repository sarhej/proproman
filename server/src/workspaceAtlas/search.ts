import type { WorkspaceAtlas } from "./zodSchemas.js";

export type WorkspaceSearchHit = {
  objectType: "DOMAIN" | "PRODUCT" | "INITIATIVE" | "FEATURE" | "REQUIREMENT";
  id: string;
  title: string;
  subtitle?: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Keyword search over atlas indices only (no full-text RAG). Case-insensitive substring.
 */
export function searchWorkspaceAtlas(atlas: WorkspaceAtlas, query: string, limit: number): WorkspaceSearchHit[] {
  const q = norm(query);
  if (!q) return [];

  const hits: WorkspaceSearchHit[] = [];

  const push = (h: WorkspaceSearchHit) => {
    if (hits.length >= limit) return;
    hits.push(h);
  };

  for (const d of atlas.domains) {
    if (hits.length >= limit) break;
    if (norm(d.name).includes(q)) {
      push({ objectType: "DOMAIN", id: d.id, title: d.name });
    }
  }
  for (const p of atlas.products) {
    if (hits.length >= limit) break;
    if (norm(p.name).includes(q) || norm(p.slug).includes(q)) {
      push({ objectType: "PRODUCT", id: p.id, title: p.name, subtitle: p.slug });
    }
  }
  for (const i of atlas.initiativeIndex) {
    if (hits.length >= limit) break;
    if (norm(i.title).includes(q)) {
      push({
        objectType: "INITIATIVE",
        id: i.id,
        title: i.title,
        subtitle: i.status
      });
    }
  }
  for (const f of atlas.featureIndex) {
    if (hits.length >= limit) break;
    if (norm(f.title).includes(q)) {
      push({ objectType: "FEATURE", id: f.id, title: f.title, subtitle: f.initiativeId });
    }
  }
  for (const r of atlas.requirementIndex) {
    if (hits.length >= limit) break;
    if (norm(r.title).includes(q)) {
      push({ objectType: "REQUIREMENT", id: r.id, title: r.title, subtitle: r.featureId });
    }
  }

  return hits;
}

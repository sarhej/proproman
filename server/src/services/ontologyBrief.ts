import { createHash } from "node:crypto";
import type { Capability, CapabilityBinding, CapabilityStatus } from "@prisma/client";
import { prisma } from "../db.js";

export type BriefMode = "compact" | "full";

type CapabilityWithBindings = Capability & { bindings: CapabilityBinding[] };

function includeStatus(mode: BriefMode): CapabilityStatus[] {
  return mode === "compact" ? ["ACTIVE"] : ["ACTIVE", "DRAFT"];
}

function sortCaps(caps: CapabilityWithBindings[]): CapabilityWithBindings[] {
  return [...caps].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.slug.localeCompare(b.slug);
  });
}

function formatSynonyms(synonyms: unknown): string {
  if (synonyms == null) return "";
  if (Array.isArray(synonyms)) return synonyms.map(String).join(", ");
  if (typeof synonyms === "string") return synonyms;
  return JSON.stringify(synonyms);
}

function renderMarkdown(caps: CapabilityWithBindings[]): string {
  const lines: string[] = [
    "# Tymio hub — agent capability brief",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Use this map before proposing new product features; prefer existing surfaces and entities.",
    "",
    "## Terminology",
    "",
    "- **Tenant (target):** customer org boundary; not the same as Prisma `Product` (product line / pillar).",
    "- **Initiative / Feature / Requirement:** primary delivery hierarchy.",
    "",
    "## Capabilities",
    ""
  ];

  for (const c of caps) {
    lines.push(`### ${c.slug}`, "");
    lines.push(`**${c.title}** (${c.status})`, "");
    if (c.userJob) lines.push(`- **User job:** ${c.userJob}`, "");
    if (c.description) lines.push(`- **Description:** ${c.description}`, "");
    const syn = formatSynonyms(c.synonyms);
    if (syn) lines.push(`- **Synonyms:** ${syn}`, "");
    if (c.doNotConfuseWith) lines.push(`- **Do not confuse with:** ${c.doNotConfuseWith}`, "");
    if (c.bindings.length) {
      lines.push("- **Bindings:**", "");
      const sorted = [...c.bindings].sort((a, b) => {
        const t = a.bindingType.localeCompare(b.bindingType);
        if (t !== 0) return t;
        return a.bindingKey.localeCompare(b.bindingKey);
      });
      for (const b of sorted) {
        const star = b.isPrimary ? " *" : "";
        const gen = b.generated ? " _(generated)_" : "";
        lines.push(`  - \`${b.bindingType}\` \`${b.bindingKey}\`${star}${gen}${b.notes ? ` — ${b.notes}` : ""}`, "");
      }
    }
    lines.push("", "---", "");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function renderJson(caps: CapabilityWithBindings[]): object {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    capabilities: caps.map((c) => ({
      slug: c.slug,
      title: c.title,
      status: c.status,
      description: c.description,
      userJob: c.userJob,
      synonyms: c.synonyms,
      doNotConfuseWith: c.doNotConfuseWith,
      bindings: c.bindings.map((b) => ({
        type: b.bindingType,
        key: b.bindingKey,
        isPrimary: b.isPrimary,
        generated: b.generated,
        notes: b.notes
      }))
    }))
  };
}

export async function loadCapabilitiesForBrief(mode: BriefMode): Promise<CapabilityWithBindings[]> {
  const statuses = includeStatus(mode);
  return prisma.capability.findMany({
    where: { status: { in: statuses } },
    include: { bindings: true },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }]
  });
}

export function compileBriefMarkdown(mode: BriefMode, caps: CapabilityWithBindings[]): { content: string; hash: string } {
  const content = renderMarkdown(sortCaps(caps));
  const hash = createHash("sha256").update(content, "utf8").digest("hex");
  return { content, hash };
}

export function compileBriefJson(mode: BriefMode, caps: CapabilityWithBindings[]): { content: string; hash: string } {
  const obj = renderJson(sortCaps(caps));
  const content = JSON.stringify(obj, null, 2) + "\n";
  const hash = createHash("sha256").update(content, "utf8").digest("hex");
  return { content, hash };
}

export async function compileAndStoreBriefs(mode: BriefMode): Promise<void> {
  const caps = await loadCapabilitiesForBrief(mode);
  const md = compileBriefMarkdown(mode, caps);
  const js = compileBriefJson(mode, caps);

  await prisma.compiledBrief.upsert({
    where: { format_mode: { format: "md", mode } },
    create: { format: "md", mode, content: md.content, contentHash: md.hash },
    update: { content: md.content, contentHash: md.hash, generatedAt: new Date() }
  });
  await prisma.compiledBrief.upsert({
    where: { format_mode: { format: "json", mode } },
    create: { format: "json", mode, content: js.content, contentHash: js.hash },
    update: { content: js.content, contentHash: js.hash, generatedAt: new Date() }
  });
}

export async function getStoredBrief(format: "md" | "json", mode: BriefMode): Promise<{ content: string; contentHash: string; generatedAt: Date } | null> {
  const row = await prisma.compiledBrief.findUnique({
    where: { format_mode: { format, mode } }
  });
  if (!row) return null;
  return { content: row.content, contentHash: row.contentHash, generatedAt: row.generatedAt };
}

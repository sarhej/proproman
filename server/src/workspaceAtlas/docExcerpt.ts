import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Safe repo-relative paths only (no `..`, no absolute). */
export function assertSafeRepoDocPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Invalid doc path: ${relPath}`);
  }
  return normalized;
}

export function parseDocPathRef(ref: string): { filePath: string; anchor: string | null } {
  const trimmed = ref.trim();
  const hash = trimmed.indexOf("#");
  if (hash === -1) {
    return { filePath: assertSafeRepoDocPath(trimmed), anchor: null };
  }
  return {
    filePath: assertSafeRepoDocPath(trimmed.slice(0, hash)),
    anchor: trimmed.slice(hash + 1).trim() || null
  };
}

/** GitHub-style slug from a markdown heading line (without leading #). */
export function headingToAnchor(headingText: string): string {
  return headingText
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Extract a section starting at a heading whose anchor matches `anchor`, until the next heading
 * of the same or higher level. If anchor is null, returns the full file (truncated).
 */
export function extractMarkdownSection(markdown: string, anchor: string | null, maxChars = 12_000): string {
  if (!anchor) {
    return markdown.length > maxChars ? `${markdown.slice(0, maxChars)}\n\n…` : markdown;
  }

  const lines = markdown.split(/\r?\n/);
  let start = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+)$/.exec(lines[i] ?? "");
    if (!m) continue;
    const level = m[1]!.length;
    const text = m[2]!.trim();
    if (headingToAnchor(text) === anchor || headingToAnchor(text).includes(anchor)) {
      start = i;
      startLevel = level;
      break;
    }
  }

  if (start === -1) return "";

  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (i > start) {
      const m = /^(#{1,6})\s+/.exec(lines[i] ?? "");
      if (m && m[1]!.length <= startLevel) break;
    }
    out.push(lines[i]!);
    if (out.join("\n").length > maxChars) {
      out.push("\n…");
      break;
    }
  }
  return out.join("\n").trim();
}

export async function readRepoDocExcerpt(
  ref: string,
  maxChars = 12_000
): Promise<{ path: string; anchor: string | null; excerpt: string; error?: string }> {
  try {
    const { filePath, anchor } = parseDocPathRef(ref);
    const abs = path.join(REPO_ROOT, filePath);
    const markdown = await fs.readFile(abs, "utf8");
    const excerpt = extractMarkdownSection(markdown, anchor, maxChars);
    return { path: filePath, anchor, excerpt: excerpt || "(section not found)" };
  } catch (err) {
    return {
      path: ref,
      anchor: null,
      excerpt: "",
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

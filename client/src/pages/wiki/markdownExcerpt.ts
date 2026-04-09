/** Strip minimal Markdown for a short SEO description when index.json has no `description`. */
export function plainTextExcerptFromMarkdown(md: string, maxLen: number): string {
  const lines = md.split(/\r?\n/);
  const parts: string[] = [];
  for (const line of lines) {
    let t = line.replace(/^#+\s*/, "").replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/\*\*?|__|`+/g, "").trim();
    if (t) parts.push(t);
    if (parts.join(" ").length >= maxLen) break;
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trimEnd()}…`;
}

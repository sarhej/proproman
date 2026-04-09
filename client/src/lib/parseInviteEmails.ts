/** Parse textarea / comma-separated invite list; dedupe case-insensitively; cap at max (default 20). */
export function parseInviteEmailsFromText(raw: string, max = 20): string[] {
  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

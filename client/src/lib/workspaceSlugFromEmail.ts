/**
 * Suggest a workspace URL slug from an email domain (work accounts).
 * Returns null for consumer / hosted domains so callers fall back to name-based slug.
 */

const BLOCKED = new Set(
  [
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "yahoo.com",
    "yahoo.co.uk",
    "proton.me",
    "protonmail.com",
    "pm.me",
  ].map((d) => d.toLowerCase())
);

function domainFromEmail(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  return d || null;
}

function isBlockedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (d.endsWith(".onmicrosoft.com")) return true;
  return BLOCKED.has(d);
}

/** Second-level label for common TLDs (heuristic, no PSL). */
function registrableLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const second = parts[parts.length - 2] ?? "";
  const twoPartTlds = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);
  if (parts.length >= 3 && twoPartTlds.has(second) && last.length <= 3) {
    return parts[parts.length - 3] ?? second;
  }
  return second;
}

function slugifyDomainLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Returns a slug candidate from email domain, or null if not suitable.
 */
export function suggestSlugFromEmailDomain(email: string): string | null {
  const domain = domainFromEmail(email.trim());
  if (!domain || isBlockedDomain(domain)) return null;
  const label = registrableLabel(domain);
  const slug = slugifyDomainLabel(label);
  if (slug.length < 2) return null;
  return slug;
}

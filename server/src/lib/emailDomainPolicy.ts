/**
 * Consumer / hosted email domains — not used for trusted-company-domain or domain-derived slug defaults.
 */
const BLOCKED_EMAIL_DOMAINS = new Set(
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

export function isBlockedConsumerOrHostedEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return true;
  if (d.endsWith(".onmicrosoft.com")) return true;
  return BLOCKED_EMAIL_DOMAINS.has(d);
}

/** Returns the part after @, lowercased, or null. */
export function domainPartFromEmail(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

/**
 * If the contact enables "trust company domain", we store this value (must match derived domain).
 * Returns null for consumer / onmicrosoft / invalid.
 */
export function trustedBusinessDomainFromEmail(email: string): string | null {
  const domain = domainPartFromEmail(email);
  if (!domain || isBlockedConsumerOrHostedEmailDomain(domain)) return null;
  return domain;
}

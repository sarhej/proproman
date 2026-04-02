/**
 * Normalize workspace slug from URL params for public resolution (sign-in page).
 * NFKC + trim + ASCII lower — avoids invisible / compatibility-character mismatches vs DB.
 */
export function normalizePublicTenantSlug(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

import { UserRole } from "@prisma/client";

/** First-time Google sign-in: explicit emails that receive EDITOR (any domain). */
const EDITOR_EMAIL_ALLOWLIST = new Set(
  [
    "mauzon@gmail.com",
    "mromenofficial@gmail.com",
    "newgeoenergy@gmail.com",
    "pr@firstcontact.biz"
  ].map((e) => e.toLowerCase())
);

/** Any Google user with this email domain gets EDITOR on first signup. */
const EDITOR_DOMAIN_SUFFIX = "@altustechnicus.com";

/**
 * Role assigned on first Google login when the user is created.
 * Returns null → caller uses PENDING.
 */
export function autoRoleForGoogleEmail(rawEmail: string): UserRole | null {
  const email = rawEmail.trim().toLowerCase();
  if (email === "s@strt.vc") return UserRole.SUPER_ADMIN;
  if (EDITOR_EMAIL_ALLOWLIST.has(email)) return UserRole.EDITOR;
  if (email.endsWith(EDITOR_DOMAIN_SUFFIX)) return UserRole.EDITOR;
  return null;
}

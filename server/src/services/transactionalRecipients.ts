import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";

/** Primary To for E1 when this address is among super admins (case-insensitive). */
export const E1_PRIMARY_TO_EMAIL = "s@strt.vc";

/**
 * Active super admins, unique emails, ordered by account creation (stable To when primary absent).
 */
export async function getSuperAdminEmailsOrdered(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: UserRole.SUPER_ADMIN, isActive: true },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.email.trim());
  }
  return out;
}

/**
 * Single send: preferred address as To, remaining super admins on CC; otherwise first admin To, rest CC.
 */
export function layoutE1Recipients(orderedEmails: string[]): { to: string; cc: string[] } | null {
  if (orderedEmails.length === 0) return null;
  const primaryLower = E1_PRIMARY_TO_EMAIL.toLowerCase();
  const idx = orderedEmails.findIndex((e) => e.toLowerCase() === primaryLower);
  if (idx >= 0) {
    const to = orderedEmails[idx];
    const cc = orderedEmails.filter((_, i) => i !== idx);
    return { to, cc };
  }
  const [to, ...cc] = orderedEmails;
  return { to, cc };
}

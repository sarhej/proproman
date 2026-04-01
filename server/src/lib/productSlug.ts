import type { Prisma, PrismaClient } from "@prisma/client";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL-safe slug from arbitrary text (diacritics stripped). */
export function slugify(raw: string): string {
  const s = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s.length > 0 ? s : "product";
}

export function isValidProductSlug(s: string): boolean {
  return s.length >= 1 && s.length <= 80 && SLUG_PATTERN.test(s);
}

/** For import/merge: return null if not a valid slug string. */
export function tryParseProductSlug(input: string | null | undefined): string | null {
  if (input == null || input.trim() === "") return null;
  const t = input.trim().toLowerCase();
  return isValidProductSlug(t) ? t : null;
}

type ProductDelegate = PrismaClient["product"];

/**
 * Resolves a unique `slug` per tenant for Product rows.
 * When `explicitSlug` is set, it is validated and used as the base (with numeric suffixes if needed).
 */
export async function allocateUniqueProductSlug(
  prisma: { product: ProductDelegate },
  args: {
    tenantId: string | null;
    fromName: string;
    explicitSlug?: string | null;
    excludeProductId?: string;
  }
): Promise<string> {
  let base: string;
  const explicit = tryParseProductSlug(args.explicitSlug ?? null);
  if (explicit) {
    base = explicit;
  } else {
    base = slugify(args.fromName);
    if (!base) base = "product";
  }

  for (let n = 0; n < 200; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const where: Prisma.ProductWhereInput = {
      tenantId: args.tenantId === null ? { equals: null } : args.tenantId,
      slug: candidate
    };
    if (args.excludeProductId) {
      where.NOT = { id: args.excludeProductId };
    }
    const existing = await prisma.product.findFirst({ where });
    if (!existing) return candidate;
  }
  throw new Error("Could not allocate unique product slug");
}

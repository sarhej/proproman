/** Matches DB `schemaName` derivation from slug (see tenant create / requests). */
export function slugToSchemaName(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

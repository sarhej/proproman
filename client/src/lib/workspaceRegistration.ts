/**
 * Derives a URL slug from a team/workspace display name.
 * Keep in sync with public team registration (RegisterTeamPage).
 */
export function generateWorkspaceSlugFromTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

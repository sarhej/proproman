import { drdFetch } from "./api.js";
import { isValidWorkspaceSlugFormat } from "./workspaceSlug.js";

type MeTenantsResponse = {
  tenants: Array<{
    tenant: { id: string; slug: string; status: string };
  }>;
};

/**
 * Resolve workspace slug to tenant id for API-key bridge; verifies ACTIVE membership for the API key user.
 */
export async function resolveTenantIdForWorkspaceSlug(expectedSlug: string): Promise<string> {
  if (!isValidWorkspaceSlugFormat(expectedSlug)) {
    throw new Error(`Invalid workspace slug: ${JSON.stringify(expectedSlug)}`);
  }
  const want = expectedSlug.toLowerCase();
  const data = await drdFetch<MeTenantsResponse>("/api/me/tenants");
  const row = data.tenants.find(
    (m) => m.tenant.slug.toLowerCase() === want && m.tenant.status === "ACTIVE"
  );
  if (!row) {
    throw new Error(
      `API key user has no ACTIVE membership for workspace slug "${expectedSlug}". Check TYMIO_WORKSPACE_SLUG and hub memberships.`
    );
  }
  return row.tenant.id;
}

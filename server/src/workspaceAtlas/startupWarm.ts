import { TenantStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { compileWorkspaceAtlasForTenant } from "./compiler.js";
import { readWorkspaceAtlas } from "./store.js";

/**
 * After deploy, atlas JSON may be missing (ephemeral filesystem) while the hub listener
 * only rebuilds when `notifyHubChange` runs. Materialize atlas for ACTIVE tenants that
 * have no `workspace-atlas.json` yet so MCP `tymio_get_workspace_atlas` works without a manual rebuild.
 */
export async function warmMissingWorkspaceAtlases(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { status: TenantStatus.ACTIVE },
    select: { id: true, slug: true }
  });
  if (tenants.length === 0) return;

  let warmed = 0;
  for (const { id, slug } of tenants) {
    try {
      const existing = await readWorkspaceAtlas(id);
      if (existing) continue;
      await compileWorkspaceAtlasForTenant(id);
      warmed += 1;
      console.log(`[workspace-atlas] startup warm: compiled atlas for tenant slug=${slug}`);
    } catch (err) {
      console.error(`[workspace-atlas] startup warm failed tenant=${slug} (${id}):`, err);
    }
  }
  if (warmed > 0) {
    console.log(`[workspace-atlas] startup warm: ${warmed} tenant(s) materialized`);
  }
}

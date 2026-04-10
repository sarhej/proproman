import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default: `<server package>/data/workspace-atlas` (cwd is usually `server/` when running `npm run dev`). */
export function defaultWorkspaceAtlasDataDir(): string {
  const serverPackageRoot = path.resolve(__dirname, "../..");
  return path.join(serverPackageRoot, "data", "workspace-atlas");
}

export function getWorkspaceAtlasRootDir(): string {
  return env.WORKSPACE_ATLAS_DATA_DIR ?? defaultWorkspaceAtlasDataDir();
}

export function tenantAtlasDir(tenantId: string): string {
  return path.join(getWorkspaceAtlasRootDir(), tenantId);
}

export function workspaceAtlasFile(tenantId: string): string {
  return path.join(tenantAtlasDir(tenantId), "workspace-atlas.json");
}

export function objectShardFile(tenantId: string, objectType: string, id: string): string {
  return path.join(tenantAtlasDir(tenantId), "objects", objectType, `${id}.json`);
}

export async function ensureTenantAtlasDirs(tenantId: string): Promise<void> {
  const base = tenantAtlasDir(tenantId);
  const objects = path.join(base, "objects");
  await fs.mkdir(objects, { recursive: true });
  for (const t of ["DOMAIN", "PRODUCT", "INITIATIVE", "FEATURE", "REQUIREMENT"]) {
    await fs.mkdir(path.join(objects, t), { recursive: true });
  }
}

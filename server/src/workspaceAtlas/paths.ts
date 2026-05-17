import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Prisma `@default(cuid())` — one filesystem path segment only (blocks `..` / separators in IDs). */
const PRISMA_CUID_SEGMENT = /^c[a-z0-9]{24}$/;

const ATLAS_OBJECT_DIR_TYPES = [
  "DOMAIN",
  "PRODUCT",
  "INITIATIVE",
  "FEATURE",
  "REQUIREMENT",
  "ARCHITECTURE_TOPIC"
] as const;

export function assertSafeAtlasPathSegment(segment: string, label: string): void {
  if (!PRISMA_CUID_SEGMENT.test(segment)) {
    throw new Error(`${label}: invalid id format`);
  }
}

/** Default: `<server package>/data/workspace-atlas` (cwd is usually `server/` when running `npm run dev`). */
export function defaultWorkspaceAtlasDataDir(): string {
  const serverPackageRoot = path.resolve(__dirname, "../..");
  return path.join(serverPackageRoot, "data", "workspace-atlas");
}

export function getWorkspaceAtlasRootDir(): string {
  return env.WORKSPACE_ATLAS_DATA_DIR ?? defaultWorkspaceAtlasDataDir();
}

export function tenantAtlasDir(tenantId: string): string {
  assertSafeAtlasPathSegment(tenantId, "tenantId");
  return path.join(getWorkspaceAtlasRootDir(), tenantId);
}

export function workspaceAtlasFile(tenantId: string): string {
  return path.join(tenantAtlasDir(tenantId), "workspace-atlas.json");
}

export function objectShardFile(tenantId: string, objectType: string, id: string): string {
  assertSafeAtlasPathSegment(id, "object id");
  if (!(ATLAS_OBJECT_DIR_TYPES as readonly string[]).includes(objectType)) {
    throw new Error("Invalid atlas object type");
  }
  return path.join(tenantAtlasDir(tenantId), "objects", objectType, `${id}.json`);
}

export async function ensureTenantAtlasDirs(tenantId: string): Promise<void> {
  const base = tenantAtlasDir(tenantId);
  const objects = path.join(base, "objects");
  await fs.mkdir(objects, { recursive: true });
  for (const t of ATLAS_OBJECT_DIR_TYPES) {
    await fs.mkdir(path.join(objects, t), { recursive: true });
  }
}

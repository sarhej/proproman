import fs from "node:fs/promises";
import path from "node:path";
import { parseObjectShard, parseWorkspaceAtlas, type ObjectShard, type WorkspaceAtlas } from "./zodSchemas.js";
import { ensureTenantAtlasDirs, objectShardFile, workspaceAtlasFile } from "./paths.js";

export async function readWorkspaceAtlas(tenantId: string): Promise<WorkspaceAtlas | null> {
  const file = workspaceAtlasFile(tenantId);
  try {
    const raw = await fs.readFile(file, "utf8");
    return parseWorkspaceAtlas(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function readObjectShard(
  tenantId: string,
  objectType: ObjectShard["objectType"],
  id: string
): Promise<ObjectShard | null> {
  const file = objectShardFile(tenantId, objectType, id);
  try {
    const raw = await fs.readFile(file, "utf8");
    return parseObjectShard(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function writeWorkspaceAtlas(tenantId: string, atlas: WorkspaceAtlas): Promise<void> {
  await ensureTenantAtlasDirs(tenantId);
  const file = workspaceAtlasFile(tenantId);
  await fs.writeFile(file, JSON.stringify(atlas, null, 2), "utf8");
}

export async function writeObjectShard(tenantId: string, shard: ObjectShard): Promise<void> {
  await ensureTenantAtlasDirs(tenantId);
  const file = objectShardFile(tenantId, shard.objectType, shard.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(shard, null, 2), "utf8");
}

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { computeAtlasHealth } from "../workspaceAtlas/rebuildState.js";
import { objectShardObjectType } from "../workspaceAtlas/zodSchemas.js";
import { readObjectShard, readWorkspaceAtlas } from "../workspaceAtlas/store.js";

function computeFreshness(atlas: NonNullable<Awaited<ReturnType<typeof readWorkspaceAtlas>>>) {
  const materializedAt = new Date(atlas.materializedAt).getTime();
  const sourceMaxUpdatedAt = new Date(atlas.sourceMaxUpdatedAt).getTime();
  const ageMs = Date.now() - materializedAt;
  return {
    materializedAt: atlas.materializedAt,
    sourceMaxUpdatedAt: atlas.sourceMaxUpdatedAt,
    workspaceSlug: atlas.workspaceSlug,
    isStale: materializedAt < sourceMaxUpdatedAt,
    ageMinutes: Math.round(ageMs / 60_000)
  };
}

export const workspaceAtlasRouter = Router();
workspaceAtlasRouter.use(requireAuth);

workspaceAtlasRouter.get("/", async (req, res) => {
  const tenantId = getTenantId(req);
  const atlas = await readWorkspaceAtlas(tenantId);
  if (!atlas) {
    res.json({
      atlas: null,
      compiled: false,
      freshness: null,
      health: computeAtlasHealth({ tenantId, compiled: false, isStale: false })
    });
    return;
  }
  const freshness = computeFreshness(atlas);
  res.json({
    atlas,
    compiled: true,
    freshness,
    health: computeAtlasHealth({
      tenantId,
      compiled: true,
      isStale: freshness.isStale
    })
  });
});

const objectTypeParam = z.object({
  objectType: objectShardObjectType,
  id: z.string().min(1)
});

workspaceAtlasRouter.get("/objects/:objectType/:id", async (req, res) => {
  const tenantId = getTenantId(req);
  const parsed = objectTypeParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid object type or id" });
    return;
  }
  const { objectType, id } = parsed.data;
  const shard = await readObjectShard(tenantId, objectType, id);
  if (!shard) {
    res.status(404).json({ error: "Object shard not found", objectType, id });
    return;
  }
  res.json({ shard });
});

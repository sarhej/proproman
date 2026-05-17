import { Router } from "express";
import { z } from "zod";
import { runAtlasCurator } from "../atlasCurator/run.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";

const runBody = z.object({
  architectureTopicId: z.string().min(1).optional()
});

export const atlasCuratorRouter = Router();
atlasCuratorRouter.use(requireAuth);

atlasCuratorRouter.post("/run", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = runBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await runAtlasCurator({
      tenantId: getTenantId(req),
      architectureTopicId: parsed.data.architectureTopicId
    });
    await logAudit(req.user!.id, "CREATED", "ATLAS_CURATOR_RUN", result.agent, {
      created: result.created,
      skipped: result.skipped,
      topicsProcessed: result.topicsProcessed
    });
    res.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Curator run failed";
    const status = message.includes("LLM is disabled") ? 503 : 500;
    res.status(status).json({ error: message });
  }
});

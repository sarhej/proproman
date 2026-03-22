import { Router } from "express";
import { readCodingAgentGuide } from "../lib/codingAgentGuide.js";
import { requireAuth } from "../middleware/auth.js";

export const agentGuideRouter = Router();
agentGuideRouter.use(requireAuth);

/** Markdown playbook for coding agents (MCP + workflows). */
agentGuideRouter.get("/coding-guide", async (_req, res) => {
  try {
    const md = await readCodingAgentGuide();
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(md);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

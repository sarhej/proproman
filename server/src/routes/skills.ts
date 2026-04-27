import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  buildInstallManifest,
  getSkillById,
  getSkillIndexRows,
  type InstallClient,
  type InstallScope
} from "../skills/skillCatalog.js";

export const skillsPublicRouter = Router();

/** Public skill HTTP API — allow fetch from agents / IDEs (not only SPA origin). */
skillsPublicRouter.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

skillsPublicRouter.get("/index.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(getSkillIndexRows());
});

skillsPublicRouter.get("/:id.md", (req: Request, res: Response) => {
  const id = String(req.params.id ?? "").replace(/\.md$/i, "");
  const skill = getSkillById(id);
  if (!skill) {
    res.status(404).type("text/plain").send("Skill not found.");
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("ETag", `"${skill.sha256}"`);
  res.send(skill.body);
});

const manifestQuerySchema = z.object({
  client: z.enum(["cursor", "claude", "codex", "opencode"]),
  scope: z.enum(["project", "user"])
});

skillsPublicRouter.get("/:id/install-manifest", (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  const parsed = manifestQuerySchema.safeParse({
    client: typeof req.query.client === "string" ? req.query.client : undefined,
    scope: typeof req.query.scope === "string" ? req.query.scope : undefined
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Query requires client=cursor|claude|codex|opencode and scope=project|user" });
    return;
  }
  const { client, scope } = parsed.data;
  const result = buildInstallManifest(id, client as InstallClient, scope as InstallScope);
  if (!result.ok) {
    const status = result.error.includes("Unknown skill") ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    id,
    client,
    scope,
    targetPath: result.targetPath,
    body: result.body,
    mode: result.mode,
    sha256: result.sha256,
    etag: result.etag
  });
});

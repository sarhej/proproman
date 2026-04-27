import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { skillsPublicRouter } from "./skills.js";

describe("public /skills routes", () => {
  const app = express();
  app.use("/skills", skillsPublicRouter);

  it("GET /skills/index.json returns catalog rows without bodies", async () => {
    const res = await request(app).get("/skills/index.json");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const row = res.body.find((r: { id: string }) => r.id === "tymio-workspace");
    expect(row).toBeDefined();
    expect(row.version).toBeTruthy();
    expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(row.description).toBeTruthy();
    expect(row.body).toBeUndefined();
  });

  it("GET /skills/:id.md returns Markdown body", async () => {
    const res = await request(app).get("/skills/tymio-workspace.md");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Tymio workspace/);
    expect(res.headers["content-type"]).toMatch(/text\/markdown/);
  });

  it("GET /skills/:id/install-manifest requires client and scope", async () => {
    const res = await request(app).get("/skills/tymio-workspace/install-manifest");
    expect(res.status).toBe(400);
  });

  it("GET /skills/:id/install-manifest returns targetPath for cursor+project", async () => {
    const res = await request(app).get(
      "/skills/tymio-workspace/install-manifest?client=cursor&scope=project"
    );
    expect(res.status).toBe(200);
    expect(res.body.targetPath).toBe(".cursor/skills/tymio-workspace/SKILL.md");
    expect(res.body.body).toBeTruthy();
    expect(res.body.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("GET /skills/:id/install-manifest rejects Codex project scope", async () => {
    const res = await request(app).get(
      "/skills/tymio-workspace/install-manifest?client=codex&scope=project"
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Codex/);
  });

  it("GET /skills/unknown.md returns 404", async () => {
    const res = await request(app).get("/skills/nonexistent-skill-id.md");
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/not found/i);
  });

  it("GET /skills/:id/install-manifest returns 404 for unknown skill", async () => {
    const res = await request(app).get(
      "/skills/unknown-skill/install-manifest?client=cursor&scope=project"
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Unknown skill/);
  });

  it("GET /skills/:id/install-manifest returns 400 for invalid client", async () => {
    const res = await request(app).get(
      "/skills/tymio-workspace/install-manifest?client=vim&scope=project"
    );
    expect(res.status).toBe(400);
  });

  it("GET /skills/:id/install-manifest returns 400 for invalid scope", async () => {
    const res = await request(app).get(
      "/skills/tymio-workspace/install-manifest?client=cursor&scope=machine"
    );
    expect(res.status).toBe(400);
  });

  it("GET /skills/:id/install-manifest sets claude user path", async () => {
    const res = await request(app).get(
      "/skills/tymio-pm-agent/install-manifest?client=claude&scope=user"
    );
    expect(res.status).toBe(200);
    expect(res.body.targetPath).toBe("~/.claude/skills/tymio-pm-agent/SKILL.md");
  });

  it("GET /skills/:id/install-manifest sets opencode project path", async () => {
    const res = await request(app).get(
      "/skills/tymio-dev-agent/install-manifest?client=opencode&scope=project"
    );
    expect(res.status).toBe(200);
    expect(res.body.targetPath).toBe(".opencode/agent/tymio-dev-agent.md");
  });

  it("GET /skills/index.json exposes Access-Control-Allow-Origin", async () => {
    const res = await request(app).get("/skills/index.json");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("GET /skills/:id.md exposes ETag", async () => {
    const res = await request(app).get("/skills/tymio-workspace.md");
    expect(res.headers.etag).toBeTruthy();
  });

  it("GET /skills/index.json is stable sorted by id", async () => {
    const res = await request(app).get("/skills/index.json");
    const ids = res.body.map((r: { id: string }) => r.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });
});

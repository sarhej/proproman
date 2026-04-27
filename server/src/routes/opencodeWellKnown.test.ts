import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { opencodeWellKnownHandler } from "./opencodeWellKnown.js";

describe("GET /.well-known/opencode", () => {
  const prev = { NODE_ENV: process.env.NODE_ENV, PORT: process.env.PORT };

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.PORT = "8080";
  });

  afterEach(() => {
    process.env.NODE_ENV = prev.NODE_ENV;
    process.env.PORT = prev.PORT;
  });

  it("returns OpenCode remote MCP JSON with discovery URL and CORS", async () => {
    const app = express();
    app.get("/.well-known/opencode", opencodeWellKnownHandler);
    const res = await request(app).get("/.well-known/opencode");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toMatch(/max-age/);
    expect(res.body.mcp?.tymio?.type).toBe("remote");
    expect(res.body.mcp?.tymio?.url).toBe("http://localhost:8080/mcp");
    expect(res.body.mcp?.tymio?.enabled).toBe(true);
  });
});

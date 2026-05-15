import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { wellKnownRouter } from "./wellKnown.js";

describe("wellKnownRouter", () => {
  it("GET /.well-known/oauth-protected-resource returns JSON for agent scanners (RFC 9728 fields)", async () => {
    const app = express();
    app.use("/.well-known", wellKnownRouter);
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(typeof res.body.resource).toBe("string");
    expect(res.body.resource).toMatch(/\/mcp$/);
    expect(Array.isArray(res.body.authorization_servers)).toBe(true);
    expect(res.body.authorization_servers.length).toBeGreaterThan(0);
    expect(res.body.scopes_supported).toContain("mcp:tools");
  });
});

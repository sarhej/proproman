import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOAuthProvider, removeAllOAuthFiles } from "./fileOAuthProvider.js";
import { withTempXdgConfig } from "./test/helpers.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() })
}));

describe("FileOAuthProvider", () => {
  let ctx: ReturnType<typeof withTempXdgConfig>;

  beforeEach(() => {
    ctx = withTempXdgConfig();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.clearAllMocks();
  });

  it("persists client, tokens, and discovery state", async () => {
    const redirect = new URL("http://127.0.0.1:19876/callback");
    const p = new FileOAuthProvider(redirect);

    p.saveClientInformation({ client_id: "cid-1" } as Parameters<FileOAuthProvider["saveClientInformation"]>[0]);
    expect(p.clientInformation()).toMatchObject({ client_id: "cid-1" });

    p.saveTokens({
      access_token: "at",
      token_type: "Bearer",
      refresh_token: "rt"
    });
    expect(p.tokens()?.access_token).toBe("at");

    await p.saveDiscoveryState({
      authorizationServerUrl: "https://hub.example",
      resourceMetadata: undefined,
      authorizationServerMetadata: undefined
    });
    const d = await p.discoveryState();
    expect(d?.authorizationServerUrl).toBe("https://hub.example");
  });

  it("codeVerifier throws when not set", () => {
    const p = new FileOAuthProvider(new URL("http://127.0.0.1:1/callback"));
    expect(() => p.codeVerifier()).toThrow(/Missing PKCE code verifier/);
  });

  it("saveCodeVerifier enables codeVerifier()", () => {
    const p = new FileOAuthProvider(new URL("http://127.0.0.1:1/callback"));
    p.saveCodeVerifier("verifier-xyz");
    expect(p.codeVerifier()).toBe("verifier-xyz");
  });

  it("state() is stable across calls until clearLoginSession", async () => {
    const p = new FileOAuthProvider(new URL("http://127.0.0.1:1/callback"));
    const a = await p.state();
    const b = await p.state();
    expect(a).toBe(b);
    p.clearLoginSession();
    const c = await p.state();
    expect(c).not.toBe(a);
  });

  it("clientMetadata uses string redirect_uris and public client settings", () => {
    const p = new FileOAuthProvider(new URL("http://127.0.0.1:55/callback"));
    const m = p.clientMetadata;
    expect(m.redirect_uris).toEqual(["http://127.0.0.1:55/callback"]);
    expect(m.token_endpoint_auth_method).toBe("none");
    expect(m.scope).toBe("mcp:tools");
  });

  it("invalidateCredentials removes files per scope", async () => {
    const p = new FileOAuthProvider(new URL("http://127.0.0.1:1/callback"));
    const dir = path.join(ctx.root, "tymio-mcp");
    p.saveClientInformation({ client_id: "x" } as Parameters<FileOAuthProvider["saveClientInformation"]>[0]);
    p.saveTokens({ access_token: "a", token_type: "Bearer" });
    await p.saveDiscoveryState({ authorizationServerUrl: "https://a" });

    await p.invalidateCredentials("tokens");
    expect(fs.existsSync(path.join(dir, "oauth-tokens.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "oauth-client.json"))).toBe(true);

    await p.invalidateCredentials("all");
    expect(fs.existsSync(path.join(dir, "oauth-client.json"))).toBe(false);
  });

  it("redirectToAuthorization logs and spawns open", async () => {
    const { spawn } = await import("node:child_process");
    const p = new FileOAuthProvider(new URL("http://127.0.0.1:1/callback"));
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    p.redirectToAuthorization(new URL("https://auth.example/authorize?x=1"));
    expect(err).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("removeAllOAuthFiles", () => {
  it("removes known files even when some are missing", () => {
    const ctx = withTempXdgConfig();
    const dir = path.join(ctx.root, "tymio-mcp");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "oauth-tokens.json"), "{}", "utf8");
    removeAllOAuthFiles();
    expect(fs.existsSync(path.join(dir, "oauth-tokens.json"))).toBe(false);
    expect(() => removeAllOAuthFiles()).not.toThrow();
    ctx.cleanup();
  });
});

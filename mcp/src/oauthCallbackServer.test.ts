import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileOAuthProvider } from "./fileOAuthProvider.js";
import { startOAuthCallbackServer } from "./oauthCallbackServer.js";
import { reserveEphemeralPort } from "./test/helpers.js";

describe("startOAuthCallbackServer", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  function stubProvider(fixedState: string): FileOAuthProvider {
    return {
      state: async () => fixedState
    } as unknown as FileOAuthProvider;
  }

  it("resolves waitForCode when code and state match", async () => {
    const port = await reserveEphemeralPort();
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    const provider = stubProvider("abc123");
    const handle = await startOAuthCallbackServer(redirectUrl, provider);

    const fetchPromise = fetch(`http://127.0.0.1:${port}/callback?code=secret-code&state=abc123`);
    const code = await handle.waitForCode;
    const res = await fetchPromise;
    expect(code).toBe("secret-code");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Signed in to Tymio");

    handle.close();
  });

  it("returns 404 for wrong pathname", async () => {
    const port = await reserveEphemeralPort();
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    const handle = await startOAuthCallbackServer(redirectUrl, stubProvider("s"));

    const res = await fetch(`http://127.0.0.1:${port}/wrong?code=x&state=s`);
    expect(res.status).toBe(404);

    handle.close();
    void handle.waitForCode.catch(() => {
      /* dangling: no callback for 404 */
    });
  });

  it("rejects on OAuth error query param", async () => {
    const port = await reserveEphemeralPort();
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    const handle = await startOAuthCallbackServer(redirectUrl, stubProvider("s"));

    const failure = expect(handle.waitForCode).rejects.toThrow(/<bad>/);
    const res = await fetch(
      `http://127.0.0.1:${port}/callback?error=access_denied&error_description=${encodeURIComponent("<bad>")}`
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("&lt;bad&gt;");
    await failure;

    handle.close();
  });

  it("rejects when code is missing", async () => {
    const port = await reserveEphemeralPort();
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    const handle = await startOAuthCallbackServer(redirectUrl, stubProvider("s"));

    const failure = expect(handle.waitForCode).rejects.toThrow(/Missing authorization code/);
    await fetch(`http://127.0.0.1:${port}/callback?state=s`);
    await failure;

    handle.close();
  });

  it("rejects when state mismatch", async () => {
    const port = await reserveEphemeralPort();
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    const handle = await startOAuthCallbackServer(redirectUrl, stubProvider("expected"));

    const failure = expect(handle.waitForCode).rejects.toThrow(/OAuth state mismatch/);
    await fetch(`http://127.0.0.1:${port}/callback?code=c&state=wrong`);
    await failure;

    handle.close();
  });

  it("returns 500 and rejects when provider.state() throws", async () => {
    const port = await reserveEphemeralPort();
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    const badProvider = {
      state: async () => {
        throw new Error("state boom");
      }
    } as unknown as FileOAuthProvider;
    const handle = await startOAuthCallbackServer(redirectUrl, badProvider);

    const failure = expect(handle.waitForCode).rejects.toThrow(/state boom/);
    const res = await fetch(`http://127.0.0.1:${port}/callback?code=c&state=s`);
    expect(res.status).toBe(500);
    await failure;

    handle.close();
  });

  it("fails listen when port is already in use", async () => {
    const port = await reserveEphemeralPort();
    const holder = net.createServer();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(port, "127.0.0.1", () => resolve());
    });
    const redirectUrl = new URL(`http://127.0.0.1:${port}/callback`);
    await expect(startOAuthCallbackServer(redirectUrl, stubProvider("x"))).rejects.toThrow(/EADDRINUSE|already in use/i);
    await new Promise<void>((resolve, reject) => holder.close((err) => (err ? reject(err) : resolve())));
  });
});

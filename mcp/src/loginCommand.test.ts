import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const startOAuthCallbackServerMock = vi.hoisted(() =>
  vi.fn(async () => ({
    waitForCode: Promise.resolve("auth-code-99"),
    close: vi.fn()
  }))
);

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  auth: authMock
}));

vi.mock("./oauthCallbackServer.js", () => ({
  startOAuthCallbackServer: startOAuthCallbackServerMock
}));

import { runLoginCommand } from "./loginCommand.js";
import { withTempXdgConfig } from "./test/helpers.js";

describe("runLoginCommand", () => {
  let ctx: ReturnType<typeof withTempXdgConfig>;

  beforeEach(() => {
    ctx = withTempXdgConfig();
    authMock.mockReset();
    startOAuthCallbackServerMock.mockClear();
    startOAuthCallbackServerMock.mockImplementation(async () => ({
      waitForCode: Promise.resolve("auth-code-99"),
      close: vi.fn()
    }));
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("runs auth twice on REDIRECT then AUTHORIZED", async () => {
    authMock.mockResolvedValueOnce("REDIRECT").mockResolvedValueOnce("AUTHORIZED");
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runLoginCommand(new URL("https://hub.example/mcp"));

    expect(authMock).toHaveBeenCalledTimes(2);
    expect(authMock.mock.calls[0][1]).toMatchObject({ serverUrl: expect.any(URL) });
    expect(authMock.mock.calls[1][1]).toMatchObject({
      serverUrl: expect.any(URL),
      authorizationCode: "auth-code-99"
    });
    expect(startOAuthCallbackServerMock).toHaveBeenCalledOnce();
    expect(err.mock.calls.some((c) => String(c[0]).includes("login succeeded"))).toBe(true);
    err.mockRestore();
  });

  it("closes callback server when auth throws", async () => {
    const close = vi.fn();
    startOAuthCallbackServerMock.mockImplementationOnce(async () => ({
      waitForCode: new Promise(() => {
        /* never */
      }),
      close
    }));
    authMock.mockRejectedValueOnce(new Error("network down"));

    await expect(runLoginCommand(new URL("https://hub.example/mcp"))).rejects.toThrow("network down");
    expect(close).toHaveBeenCalled();
  });

  it("succeeds when first auth returns AUTHORIZED without redirect", async () => {
    authMock.mockResolvedValueOnce("AUTHORIZED");
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runLoginCommand(new URL("https://hub.example/mcp"));
    expect(authMock).toHaveBeenCalledOnce();
    expect(err.mock.calls.some((c) => String(c[0]).includes("login succeeded"))).toBe(true);
    err.mockRestore();
  });

  it("throws when auth ends neither AUTHORIZED nor handled REDIRECT", async () => {
    authMock.mockResolvedValueOnce("REDIRECT");
    startOAuthCallbackServerMock.mockImplementationOnce(async () => ({
      waitForCode: Promise.resolve("code"),
      close: vi.fn()
    }));
    authMock.mockResolvedValueOnce("REDIRECT");

    await expect(runLoginCommand(new URL("https://hub.example/mcp"))).rejects.toThrow(/Unexpected auth result/);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { readOAuthLoginTimeoutMs, withTimeout } from "./oauthLoginTimeout.js";

describe("readOAuthLoginTimeoutMs", () => {
  const prev = process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS;

  afterEach(() => {
    if (prev === undefined) delete process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS;
    else process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS = prev;
  });

  it("returns undefined when unset", () => {
    delete process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS;
    expect(readOAuthLoginTimeoutMs()).toBeUndefined();
  });

  it("returns ms for positive integer string", () => {
    process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS = "900000";
    expect(readOAuthLoginTimeoutMs()).toBe(900000);
  });

  it("returns undefined for zero or negative", () => {
    process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS = "0";
    expect(readOAuthLoginTimeoutMs()).toBeUndefined();
    process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS = "-1";
    expect(readOAuthLoginTimeoutMs()).toBeUndefined();
  });
});

describe("withTimeout", () => {
  it("resolves when promise wins", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 5000, "no")).resolves.toBe("ok");
  });

  it("rejects when timer wins", async () => {
    await expect(
      withTimeout(new Promise<string>(() => {}), 20, "timed out")
    ).rejects.toThrow(/timed out/);
  });
});

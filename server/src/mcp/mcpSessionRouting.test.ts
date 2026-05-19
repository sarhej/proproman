import { describe, expect, it } from "vitest";
import {
  bodyIsMcpInitialize,
  shouldStartNewMcpSessionAfterStaleId
} from "./mcpSessionRouting.js";

describe("mcpSessionRouting", () => {
  describe("bodyIsMcpInitialize", () => {
    it("detects single initialize", () => {
      expect(
        bodyIsMcpInitialize({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} })
      ).toBe(true);
    });

    it("detects initialize in batch", () => {
      expect(
        bodyIsMcpInitialize([
          { jsonrpc: "2.0", method: "notifications/initialized" },
          { jsonrpc: "2.0", method: "initialize", id: 1, params: {} }
        ])
      ).toBe(true);
    });

    it("returns false for other methods", () => {
      expect(bodyIsMcpInitialize({ jsonrpc: "2.0", method: "tools/list", id: 1 })).toBe(false);
    });
  });

  describe("shouldStartNewMcpSessionAfterStaleId", () => {
    it("allows new session when stale id and initialize body", () => {
      expect(
        shouldStartNewMcpSessionAfterStaleId("old-session", false, {
          jsonrpc: "2.0",
          method: "initialize",
          id: 1
        })
      ).toBe(true);
    });

    it("rejects stale id without initialize", () => {
      expect(
        shouldStartNewMcpSessionAfterStaleId("old-session", false, {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1
        })
      ).toBe(false);
    });
  });
});

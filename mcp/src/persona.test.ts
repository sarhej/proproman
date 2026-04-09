import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMcpServerInstructions,
  loadPersonaMarkdown,
  normalizePersonaId,
  runPersonaCli
} from "./persona.js";

describe("normalizePersonaId", () => {
  it("maps hub to workspace", () => {
    expect(normalizePersonaId("hub")).toBe("workspace");
    expect(normalizePersonaId("WORKSPACE")).toBe("workspace");
  });
  it("returns null for empty or unknown", () => {
    expect(normalizePersonaId(undefined)).toBeNull();
    expect(normalizePersonaId("   ")).toBeNull();
    expect(normalizePersonaId("xy")).toBeNull();
  });
});

describe("loadPersonaMarkdown", () => {
  it("loads pm bundle", () => {
    expect(loadPersonaMarkdown("pm")).toMatch(/Product Manager/);
  });
});

describe("getMcpServerInstructions", () => {
  afterEach(() => {
    delete process.env.TYMIO_MCP_PERSONA;
  });

  it("appends persona when TYMIO_MCP_PERSONA=po", () => {
    process.env.TYMIO_MCP_PERSONA = "po";
    const text = getMcpServerInstructions();
    expect(text).toMatch(/Product Owner/);
    expect(text).toMatch(/TYMIO_MCP_PERSONA=po/);
  });

  it("stderr warns on unknown persona and returns base only", () => {
    process.env.TYMIO_MCP_PERSONA = "nope";
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const text = getMcpServerInstructions();
    expect(err.mock.calls.some((c) => String(c[0]).includes("Unknown TYMIO_MCP_PERSONA"))).toBe(true);
    expect(text).not.toContain("## Bundled agent persona");
    err.mockRestore();
  });
});

describe("runPersonaCli", () => {
  it("returns 0 and prints pm to stdout", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = runPersonaCli(["pm"]);
    expect(code).toBe(0);
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toMatch(/Product Manager/);
    spy.mockRestore();
  });

  it("returns 1 for unknown id", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = runPersonaCli(["bogus"]);
    expect(code).toBe(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

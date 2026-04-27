import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { detectClients } from "./clientDetect.js";

describe("detectClients", () => {
  let tmp = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tymio-detect-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects cursor when .cursor exists", () => {
    fs.mkdirSync(path.join(tmp, ".cursor"));
    expect(detectClients(tmp, {})).toContain("cursor");
  });

  it("detects claude when CLAUDE.md exists", () => {
    fs.writeFileSync(path.join(tmp, "CLAUDE.md"), "x");
    expect(detectClients(tmp, {})).toContain("claude");
  });

  it("detects opencode when opencode.json exists", () => {
    fs.writeFileSync(path.join(tmp, "opencode.json"), "{}");
    expect(detectClients(tmp, {})).toContain("opencode");
  });

  it("detects cursor when CURSOR_SESSION set", () => {
    expect(detectClients(tmp, { CURSOR_SESSION: "1" })).toContain("cursor");
  });
});

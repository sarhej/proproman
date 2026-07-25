import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const routesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../routes");

/**
 * Guardrail: multipart routes must wrap `upload.single` with `multerSingleWithTenant`
 * or tenant ALS is lost and Attachment.tenantId stays null (invisible in list).
 */
describe("multer tenant ALS guardrail (source)", () => {
  it("every upload.single in routes is wrapped by multerSingleWithTenant", () => {
    const files = fs
      .readdirSync(routesDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

    const violations: string[] = [];
    for (const file of files) {
      const full = path.join(routesDir, file);
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("upload.single(")) return;
        if (line.includes("multerSingleWithTenant(upload.single(")) return;
        violations.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

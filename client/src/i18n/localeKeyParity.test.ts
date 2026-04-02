import { describe, it, expect } from "vitest";
import en from "./en.json";
import cs from "./cs.json";
import sk from "./sk.json";
import uk from "./uk.json";
import pl from "./pl.json";

/** Dot paths to every leaf value under a namespace (login, register, /t slug flows). */
function leafPaths(obj: Record<string, unknown>, prefix: string): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = `${prefix}.${k}`;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...leafPaths(v as Record<string, unknown>, p));
    } else {
      out.push(p);
    }
  }
  return out;
}

function nsPaths(bundle: Record<string, unknown>, ns: string): string[] {
  const root = bundle[ns];
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];
  return leafPaths(root as Record<string, unknown>, ns).sort();
}

function missingIn(actual: string[], expected: string[]): string[] {
  const set = new Set(actual);
  return expected.filter((k) => !set.has(k));
}

const LOCALES: { code: string; bundle: Record<string, unknown> }[] = [
  { code: "cs", bundle: cs as Record<string, unknown> },
  { code: "sk", bundle: sk as Record<string, unknown> },
  { code: "uk", bundle: uk as Record<string, unknown> },
  { code: "pl", bundle: pl as Record<string, unknown> },
];

const EN = en as Record<string, unknown>;
const NAMESPACES = ["app", "register", "tenantSlug", "landing"] as const;

describe("i18n key parity (auth / register / public)", () => {
  for (const ns of NAMESPACES) {
    it(`en.json defines non-empty namespace "${ns}"`, () => {
      const paths = nsPaths(EN, ns);
      expect(paths.length).toBeGreaterThan(0);
    });
  }

  for (const { code, bundle } of LOCALES) {
    describe(`locale ${code}`, () => {
      for (const ns of NAMESPACES) {
        it(`has same keys as en for "${ns}"`, () => {
          const want = nsPaths(EN, ns);
          const have = nsPaths(bundle, ns);
          expect(missingIn(have, want)).toEqual([]);
          expect(missingIn(want, have)).toEqual([]);
        });
      }
    });
  }
});

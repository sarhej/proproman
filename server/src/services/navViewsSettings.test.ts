import { describe, it, expect } from "vitest";
import {
  mergeHiddenNavPaths,
  normalizeHiddenNavPaths,
  tenantHiddenNavPathsFromSettings,
  atLeastOneNavVisible,
  MANAGED_NAV_PATHS
} from "./navViewsSettings.js";

describe("navViewsSettings", () => {
  it("normalizes and dedupes hidden paths", () => {
    expect(normalizeHiddenNavPaths(["/gantt", "/gantt", "bogus", "/calendar"])).toEqual(["/gantt", "/calendar"]);
  });

  it("merges platform and tenant extras as union", () => {
    const m = mergeHiddenNavPaths(["/gantt"], ["/calendar", "/gantt"]);
    expect(m.sort()).toEqual(["/calendar", "/gantt"]);
  });

  it("reads tenant extras from settings JSON", () => {
    expect(tenantHiddenNavPathsFromSettings({ hiddenNavPaths: ["/gantt"] })).toEqual(["/gantt"]);
    expect(tenantHiddenNavPathsFromSettings(null)).toEqual([]);
  });

  it("atLeastOneNavVisible when not everything hidden", () => {
    expect(atLeastOneNavVisible([])).toBe(true);
    expect(atLeastOneNavVisible(MANAGED_NAV_PATHS.slice(0, -1))).toBe(true);
    expect(atLeastOneNavVisible([...MANAGED_NAV_PATHS])).toBe(false);
  });
});

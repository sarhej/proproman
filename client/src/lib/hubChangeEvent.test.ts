import { describe, expect, it } from "vitest";
import { PRODUCT_EXPLORER_HUB_ENTITIES } from "./hubChangeEvent";

describe("PRODUCT_EXPLORER_HUB_ENTITIES", () => {
  it("includes backlog and structure types that affect Products & Systems", () => {
    expect(PRODUCT_EXPLORER_HUB_ENTITIES.has("PRODUCT")).toBe(true);
    expect(PRODUCT_EXPLORER_HUB_ENTITIES.has("INITIATIVE")).toBe(true);
    expect(PRODUCT_EXPLORER_HUB_ENTITIES.has("FEATURE")).toBe(true);
    expect(PRODUCT_EXPLORER_HUB_ENTITIES.has("REQUIREMENT")).toBe(true);
    expect(PRODUCT_EXPLORER_HUB_ENTITIES.has("DOMAIN")).toBe(true);
  });

  it("excludes auxiliary atlas events", () => {
    expect(PRODUCT_EXPLORER_HUB_ENTITIES.has("ATLAS_AUXILIARY")).toBe(false);
  });
});

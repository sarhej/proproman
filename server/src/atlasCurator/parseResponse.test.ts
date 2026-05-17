import { describe, it, expect } from "vitest";
import { parseCuratorLlmResponse, stripJsonFence } from "./parseResponse.js";

describe("parseCuratorLlmResponse", () => {
  it("parses bare JSON proposals array", () => {
    const raw = JSON.stringify({
      proposals: [
        {
          proposalType: "GAP_REPORT",
          proposedValue: { kind: "missing_docs", message: "No doc paths configured" },
          sources: [{ kind: "other", ref: "layers.gaps" }],
          confidence: 0.9
        }
      ]
    });
    const items = parseCuratorLlmResponse(raw);
    expect(items).toHaveLength(1);
    expect(items[0].proposalType).toBe("GAP_REPORT");
  });

  it("strips markdown code fences", () => {
    const inner = JSON.stringify({ proposals: [] });
    expect(stripJsonFence(`\`\`\`json\n${inner}\n\`\`\``)).toBe(inner);
  });

  it("rejects invalid proposal shape", () => {
    expect(() => parseCuratorLlmResponse(JSON.stringify({ proposals: [{ proposalType: "BAD" }] }))).toThrow(
      /schema validation/i
    );
  });
});

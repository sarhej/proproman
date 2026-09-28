import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const envState = vi.hoisted(() => ({
  enabled: true,
  apiKey: "sk-test" as string | undefined
}));

vi.mock("../env.js", () => ({
  env: {
    get WORKSPACE_ATLAS_LLM_ENABLED() {
      return envState.enabled;
    },
    get WORKSPACE_ATLAS_OPENAI_API_KEY() {
      return envState.apiKey;
    },
    WORKSPACE_ATLAS_OPENAI_MODEL: "gpt-4o-mini"
  }
}));

import { parseBugDrafts } from "./bugParser.js";
import type { CreationPlan } from "./creationPlanSchema.js";

const bugPlan: CreationPlan = {
  planType: "SINGLE_BUG_FEATURE",
  rationale: "test",
  confidence: 0.7,
  items: [
    {
      key: "bug-1",
      hubEntityType: "Feature",
      title: "Login clipped",
      storyType: "BUG",
      parentKey: null,
      bugSeverity: "HIGH"
    }
  ]
};

describe("parseBugDrafts LLM path", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    envState.enabled = true;
    envState.apiKey = "sk-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses LLM drafts when enabled and response validates", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    key: "bug-1",
                    title: "LLM title",
                    description: "from model",
                    stepsToReproduce: ["step 1"],
                    expected: "ok",
                    actual: "broken",
                    environment: "web",
                    severity: "MEDIUM",
                    priority: "P2",
                    acceptanceCriteria: ["must work"],
                    affectedArea: "auth",
                    requirements: []
                  }
                ]
              })
            }
          }
        ]
      })
    });

    const result = await parseBugDrafts({
      rawText: "something broken",
      creationPlan: bugPlan
    });
    expect(result.source).toBe("llm");
    expect(result.drafts.items[0]!.title).toBe("LLM title");
    expect(result.drafts.items[0]!.priority).toBe("P2");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to heuristic when LLM HTTP fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await parseBugDrafts({
      rawText: "Login CTA clipped on rotate with long labels and clear repro",
      creationPlan: bugPlan
    });
    expect(result.source).toBe("heuristic");
    expect(result.drafts.items[0]!.key).toBe("bug-1");
  });

  it("falls back to heuristic when LLM returns invalid payload", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ items: [] }) } }]
      })
    });

    const result = await parseBugDrafts({
      rawText: "Broken export button",
      creationPlan: bugPlan
    });
    expect(result.source).toBe("heuristic");
  });

  it("uses heuristic when LLM disabled", async () => {
    envState.enabled = false;
    envState.apiKey = undefined;

    const result = await parseBugDrafts({
      rawText: "Broken button",
      creationPlan: bugPlan
    });
    expect(result.source).toBe("heuristic");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

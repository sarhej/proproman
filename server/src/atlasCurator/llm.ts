import { env } from "../env.js";
import { workspaceAtlasMetrics } from "../workspaceAtlas/metrics.js";

export interface AtlasCuratorLlm {
  completeJson(systemPrompt: string, userPrompt: string): Promise<string>;
}

export class NoopAtlasCuratorLlm implements AtlasCuratorLlm {
  async completeJson(): Promise<string> {
    throw new Error(
      "Atlas Curator LLM is disabled. Set WORKSPACE_ATLAS_LLM_ENABLED=true and WORKSPACE_ATLAS_OPENAI_API_KEY."
    );
  }
}

export class OpenAiAtlasCuratorLlm implements AtlasCuratorLlm {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async completeJson(systemPrompt: string, userPrompt: string): Promise<string> {
    workspaceAtlasMetrics.llmCalls += 1;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    if (!res.ok) {
      workspaceAtlasMetrics.llmFailures += 1;
      const errText = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      workspaceAtlasMetrics.llmFailures += 1;
      throw new Error("OpenAI returned empty content");
    }
    return text;
  }
}

export function createAtlasCuratorLlmFromEnv(): AtlasCuratorLlm {
  if (env.WORKSPACE_ATLAS_LLM_ENABLED && env.WORKSPACE_ATLAS_OPENAI_API_KEY) {
    return new OpenAiAtlasCuratorLlm(env.WORKSPACE_ATLAS_OPENAI_API_KEY, env.WORKSPACE_ATLAS_OPENAI_MODEL);
  }
  return new NoopAtlasCuratorLlm();
}

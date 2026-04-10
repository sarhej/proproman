import { env } from "../env.js";
import { workspaceAtlasMetrics } from "./metrics.js";

export interface WorkspaceAtlasLlm {
  /** Natural-language explanation; caller passes grounded JSON context. */
  completeText(systemPrompt: string, userPrompt: string): Promise<string>;
}

export class NoopWorkspaceAtlasLlm implements WorkspaceAtlasLlm {
  async completeText(): Promise<string> {
    throw new Error(
      "Workspace atlas LLM is disabled. Set WORKSPACE_ATLAS_LLM_ENABLED=true and WORKSPACE_ATLAS_OPENAI_API_KEY."
    );
  }
}

/**
 * Minimal OpenAI chat completion (no extra npm dependency).
 * Used only for optional `tymio_explain_workspace_object`.
 */
export class OpenAiWorkspaceAtlasLlm implements WorkspaceAtlasLlm {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async completeText(systemPrompt: string, userPrompt: string): Promise<string> {
    workspaceAtlasMetrics.llmCalls += 1;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
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

export function createWorkspaceAtlasLlmFromEnv(): WorkspaceAtlasLlm {
  if (env.WORKSPACE_ATLAS_LLM_ENABLED && env.WORKSPACE_ATLAS_OPENAI_API_KEY) {
    return new OpenAiWorkspaceAtlasLlm(env.WORKSPACE_ATLAS_OPENAI_API_KEY, env.WORKSPACE_ATLAS_OPENAI_MODEL);
  }
  return new NoopWorkspaceAtlasLlm();
}

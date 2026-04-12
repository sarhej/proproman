import { useEffect, useState } from "react";

type AgentContextPayload = {
  tymioMcpCliAgentGuidanceMarkdown?: string;
};

const FALLBACK_MARKDOWN = [
  "# Tymio MCP — fallback guidance (agent-context fetch failed)",
  "",
  "## Critical",
  "",
  "- **No MCP API key** exists in Tymio user Settings, Profile, or Account. Do not instruct users to copy one from the UI.",
  "- **OAuth:** configure remote MCP URL `.../mcp` or `.../t/<workspace-slug>/mcp` on this host in the IDE, or use npm `@tymio/mcp-server` and run `tymio-mcp login` for stdio (without DRD_API_KEY/API_KEY unless you want API-key mode).",
  "- **`DRD_API_KEY` / `API_KEY`** on stdio is the **server deployment** secret for REST automation, not a personal user key.",
  "",
  "Prefer: GET /api/mcp/agent-context on this origin for the full Markdown field tymioMcpCliAgentGuidanceMarkdown, or /llms.txt.",
].join("\n");

/**
 * Visually hidden Markdown for autonomous agents (same content as `tymio-mcp instructions` when the hub can read mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md).
 * Loaded from the public agent-context endpoint so the SPA does not duplicate the canonical file.
 */
export function AgentMcpCliHiddenGuidance() {
  const [markdown, setMarkdown] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const origin = window.location.origin;
    fetch(`${origin}/api/mcp/agent-context`)
      .then((r) => r.json())
      .then((j: AgentContextPayload) => {
        if (cancelled) return;
        const raw = j.tymioMcpCliAgentGuidanceMarkdown?.trim();
        setMarkdown(raw && raw.length > 0 ? raw : FALLBACK_MARKDOWN);
      })
      .catch(() => {
        if (!cancelled) setMarkdown(FALLBACK_MARKDOWN);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!markdown) return null;

  return (
    <aside className="sr-only" aria-label="Tymio MCP CLI and OAuth — full Markdown for coding agents">
      <pre className="whitespace-pre-wrap font-sans text-xs">{markdown}</pre>
    </aside>
  );
}

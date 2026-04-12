# Agent context (generated)

- **`AGENT_BRIEF.md`** — compiled capability ontology for AI agents. Produced by the hub: **Admin → Ontology → Export brief to repo file**, or `POST /api/ontology/export-file`, or `npm run ontology:refresh --workspace server` after migrations.

Do not hand-edit `AGENT_BRIEF.md` as the source of truth; edit capabilities in the hub and re-export.

**MCP CLI / OAuth (canonical):** [`mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md`](../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md) — tell users to use OAuth or `tymio-mcp login`; hosted MCP may be **`/mcp`** or **`/t/<workspace-slug>/mcp`**. There is **no** MCP API key in Tymio user Settings. Also: `GET /api/mcp/agent-context` → `tymioMcpCliAgentGuidanceMarkdown`.

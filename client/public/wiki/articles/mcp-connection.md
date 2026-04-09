# MCP connection overview

Tymio exposes a **Model Context Protocol (MCP)** endpoint on **`/mcp`** on your deployment origin (e.g. `https://tymio.app/mcp`). Authentication uses **OAuth** (Google sign-in); there is **no personal MCP API key** in Tymio Settings.

## Choose a path

| Situation | Recommended approach |
|-----------|------------------------|
| **OpenClaw** or any host that runs MCP as a **stdio subprocess** | Install **`@tymio/mcp-server`**, run **`tymio-mcp login`**, point MCP config at the **`tymio-mcp`** binary. |
| **Cursor**, **Claude Code**, or clients with **remote** MCP + browser OAuth | Add a remote server URL **`https://<host>/mcp`** (Streamable HTTP) and complete sign-in in the browser. |
| **CI / automation** | Use **`DRD_API_KEY`** / server **`API_KEY`** on the stdio process only if you accept the **smaller REST tool subset**; this is a deployment secret, not an end-user Settings field. |

## Machine-readable context

- **`GET /api/mcp/agent-context`** (JSON, no auth) — includes **`tymioMcpCliAgentGuidanceMarkdown`**, locale metadata, and explicit **`tymioMcpNoUserSettingsApiKey`: true**.
- **`/llms.txt`** — short Markdown summary for crawlers and agents.

## Raw Markdown

This article is also available as static Markdown at **`/wiki/articles/mcp-connection.md`** on the same host (for direct fetches by agents).

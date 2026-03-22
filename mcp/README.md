# Tymio MCP server (stdio)

Local **stdio** MCP server for the Tymio hub: exposes REST APIs as [MCP](https://modelcontextprotocol.io/) tools using a **Bearer API key**. Use for scripts, CI, or when you do not want remote OAuth.

**Remote MCP** (recommended for daily Cursor use) runs inside the main Express app at `POST /mcp` with OAuth 2.1 and Google. See **[docs/HUB.md](../docs/HUB.md)** §6 for architecture, Google callback URL, and Cursor config (local + remote).

---

## Prerequisites

1. Server env: `API_KEY` set; optional `API_KEY_USER_ID` (otherwise first `SUPER_ADMIN` is used).
2. Tymio API running (e.g. `npm run dev` from repo root).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DRD_API_BASE_URL` | No (default `http://localhost:8080`) | Hub API base URL |
| `DRD_API_KEY` | Yes for authenticated tools | Same value as server `API_KEY` |

## Build and run

```bash
npm run mcp:build
npm run mcp:start
```

Or from `mcp/`: `npm run build` && `npm run start`. The process uses **stdio**; it is spawned by the MCP client, not run interactively.

## Cursor (stdio)

```json
{
  "mcpServers": {
    "tymio-local": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/repo/mcp/dist/index.js"],
      "env": {
        "DRD_API_BASE_URL": "http://localhost:8080",
        "DRD_API_KEY": "same-as-server-API_KEY"
      }
    }
  }
}
```

## Tools

**Ontology (Tymio):** `tymio_get_agent_brief`, `tymio_list_capabilities`, `tymio_get_capability` — see [docs/HUB.md](../docs/HUB.md) §6.1.

**Backlog / data (historical `drd_*` prefix):** health, meta, initiatives, features, requirements, domains, products, accounts, partners, demands, campaigns, timeline, assignments, stakeholders, etc. Full list: `server/src/mcp/tools.ts` and `mcp/src/index.ts` (stdio subset).

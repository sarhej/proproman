# DrD Hub MCP Server (stdio)

This package is the **local/stdio** MCP server. It exposes DrD Hub REST APIs as [MCP](https://modelcontextprotocol.io/) tools by calling the API over HTTP with a Bearer API key. Use it for scripts, CI, or when you prefer not to use OAuth.

For **remote** access with **OAuth 2.1 (Google login)** and per-user identity, the MCP server is built into the main Express app at `/mcp`. See [docs/MCP_API_EXPOSURE.md](../docs/MCP_API_EXPOSURE.md) for both options and Cursor config (local + remote).

---

## Prerequisites

1. **API key auth** on the DrD Hub server:
   - Set `API_KEY` in the server env (e.g. in `.env` or deployment config).
   - Optionally set `API_KEY_USER_ID` to the user ID to impersonate; otherwise the first SUPER_ADMIN is used.
   - Restart the server so requests with `Authorization: Bearer <API_KEY>` are accepted.

2. **DrD Hub API** running (e.g. `npm run dev` from repo root).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DRD_API_BASE_URL` | No (default: `http://localhost:8080`) | Base URL of the DrD Hub API. |
| `DRD_API_KEY` | Yes for authenticated tools | Same value as server `API_KEY`. |

## Build & run

```bash
# From repo root
npm run mcp:build
npm run mcp:start
```

Or from this directory:

```bash
npm run build
npm run start
```

The server uses **stdio** transport: it reads JSON-RPC from stdin and writes responses to stdout. It is intended to be spawned by an MCP client (e.g. Cursor), not run interactively.

## Cursor configuration (stdio / local only)

Add the DrD Hub MCP server in Cursor (e.g. **Settings → MCP** or the project’s `.cursor/mcp.json`). Use the **path to the built `index.js`** and pass env so the server can call your API:

```json
{
  "mcpServers": {
    "drd-hub": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dd/mcp/dist/index.js"],
      "env": {
        "DRD_API_BASE_URL": "http://localhost:8080",
        "DRD_API_KEY": "your-api-key-same-as-server-API_KEY"
      }
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/dd` with your actual repo path. Use the same `DRD_API_KEY` value as `API_KEY` in the server environment.

To use **both** local (stdio) and remote (OAuth) in Cursor, see the example in [docs/MCP_API_EXPOSURE.md](../docs/MCP_API_EXPOSURE.md) (two entries: `drd-hub` and `drd-hub-remote`).

## Tools

| Tool | Description |
|------|-------------|
| `drd_health` | Check API health. |
| `drd_meta` | Get meta (domains, products, accounts, partners, personas, revenue streams, users). |
| `drd_list_initiatives` | List initiatives (optional filters: domainId, ownerId, horizon, priority, isGap). |
| `drd_get_initiative` | Get one initiative by ID. |
| `drd_create_initiative` | Create initiative (admin/editor). |
| `drd_update_initiative` | Update initiative by ID. |
| `drd_delete_initiative` | Delete initiative by ID. |
| `drd_list_domains` | List domains. |
| `drd_list_products` | List products. |
| `drd_list_personas` | List personas. |
| `drd_list_accounts` | List accounts. |
| `drd_list_partners` | List partners. |
| `drd_list_kpis` | List initiative KPIs with context. |
| `drd_list_milestones` | List initiative milestones. |
| `drd_list_demands` | List demands. |
| `drd_list_revenue_streams` | List revenue streams. |
| `drd_list_features` | List features (optional initiativeId). |
| `drd_list_decisions` | List decisions (optional initiativeId). |
| `drd_list_risks` | List risks (optional initiativeId). |
| `drd_list_dependencies` | List initiative dependencies. |
| `drd_list_requirements` | List requirements (optional featureId). |
| `drd_list_assignments` | List assignments (optional initiativeId). |
| `drd_list_stakeholders` | List stakeholders (optional initiativeId). |
| `drd_timeline_calendar` | Timeline calendar items. |
| `drd_timeline_gantt` | Timeline Gantt tasks. |
| `drd_list_campaigns` | List campaigns. |
| `drd_get_campaign` | Get campaign by ID. |
| `drd_list_assets` | List assets (optional campaignId). |
| `drd_list_campaign_links` | List campaign links (optional campaignId). |

## Design

See [../docs/MCP_API_EXPOSURE.md](../docs/MCP_API_EXPOSURE.md) for architecture, remote OAuth flow, and security.

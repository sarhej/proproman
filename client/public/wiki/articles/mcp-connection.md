# MCP connection overview

Tymio exposes **Model Context Protocol (MCP)** over **Streamable HTTP** on your deployment origin. Authentication uses **OAuth** (Google sign-in); there is **no personal MCP API key** in Tymio Settings.

## MCP URLs (discovery vs workspace)

| URL | What you get |
|-----|----------------|
| **`https://<host>/mcp`** | **Discovery only** after OAuth: **`tymio_list_my_workspaces`** (your slugs + pinned MCP URLs) and **`tymio_mcp_routing_guide`**. No backlog tools — no tenant is selected for this endpoint. |
| **`https://<host>/t/<workspace-slug>/mcp`** | **Full workspace MCP**: all **`drd_*`** and workspace-scoped **`tymio_*`** tools (brief, atlas, …). Workspace is **pinned by the path** (matches browser hub URLs under **`/t/<workspace-slug>/…`**). |

Both paths use the same OAuth resource metadata. Use **`/t/<slug>/mcp`** in Cursor (or stdio **`TYMIO_MCP_URL`**) for day-to-day backlog automation; root **`/mcp`** is optional to discover slugs. The in-app **Connecting a coding agent** page should copy the **workspace** URL when you are inside a workspace.

## Choose a path

| Situation | Recommended approach |
|-----------|------------------------|
| **OpenClaw** or any host that runs MCP as a **stdio subprocess** | Install **`@tymio/mcp-server`**, run **`tymio-mcp login`**, point MCP config at the **`tymio-mcp`** binary. **Step-by-step:** [tymio-mcp CLI — install and use](/wiki/tymio-mcp-cli). |
| **Cursor**, **Claude Code**, or clients with **remote** MCP + browser OAuth | Add **`https://<host>/t/<workspace-slug>/mcp`** for full tools. Optional second entry **`https://<host>/mcp`** for discovery only. Complete sign-in in the browser. |
| **CI / automation** | Use **`DRD_API_KEY`** / server **`API_KEY`** on the stdio process only if you accept the **smaller REST tool subset**; this is a deployment secret, not an end-user Settings field. |

## Browser REST and `/t/…/api/…`

When you use the hub in a browser at **`/t/<workspace-slug>/…`**, the SPA typically calls tenant APIs under **`/t/<workspace-slug>/api/…`** so the workspace is determined by the URL (no reliance on **`X-Tenant-Id`** for those calls). **Legacy** JSON under **`/api/…`** remains supported for scripts and older clients, usually with **session** and/or **`X-Tenant-Id`** as documented for your deployment.

## Machine-readable context

- **`GET /api/mcp/agent-context`** (JSON, no auth) — includes **`tymioMcpCliAgentGuidanceMarkdown`**, locale metadata, and explicit **`tymioMcpNoUserSettingsApiKey`: true**.
- **`/llms.txt`** — short Markdown summary for crawlers and agents.

## Workspace atlas (backlog snapshot tools)

On the **full** MCP tool surface (remote **`/t/…/mcp`** or stdio OAuth to that URL), Tymio exposes **`tymio_get_workspace_atlas`**, **`tymio_get_workspace_object`**, **`tymio_search_workspace_objects`**, optional **`tymio_explain_workspace_object`**, and **`tymio_rebuild_workspace_atlas`**. These serve a **compiled JSON** view of the workspace backlog graph — complementary to **`tymio_get_agent_brief`** (capability ontology). They are **not** available in the API-key REST stdio subset.

**Guide:** [Workspace atlas (MCP)](/wiki/workspace-atlas) — or raw Markdown **`/wiki/articles/workspace-atlas.md`**.

## Raw Markdown

This article is also available as static Markdown at **`/wiki/articles/mcp-connection.md`** on the same host (for direct fetches by agents).

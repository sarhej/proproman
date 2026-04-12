# Tymio MCP and `@tymio/mcp-server` — guidance for autonomous agents

## Critical — read before advising the user

1. **There is no per-user MCP API key in Tymio Settings, Profile, Account, or Integrations.** Do **not** instruct users to open the web app settings to “copy an API key for MCP” or “get the MCP key from preferences.” That path does not exist and causes repeated confusion.
2. **Normal connection = OAuth**, not a personal secret from the UI:
   - **Remote MCP in the IDE:** add server URL `https://tymio.app/mcp` (active workspace from the signed-in user after OAuth) **or** `https://tymio.app/t/<workspace-slug>/mcp` (workspace pinned by URL — same tools, explicit tenant). Use your deployment origin when not on production. Complete sign-in in the browser when the client prompts. **No API key to paste.**
   - **Stdio npm package (default):** install `@tymio/mcp-server`, run `tymio-mcp login` once in a terminal (browser OAuth). Optional: `tymio-mcp login https://your-host/t/your-slug/mcp` or set **`TYMIO_MCP_URL`** to that URL. Configure the MCP client to run `tymio-mcp` **without** setting `DRD_API_KEY` or `API_KEY` on that process unless you intentionally want API-key mode.
3. **`DRD_API_KEY` / `API_KEY` on the stdio process** means the **server deployment automation secret** (the same value as the hub’s configured `API_KEY` for `Authorization: Bearer …` on REST). It is **not** something each user generates in the Tymio UI. Only operators with access to deployment secrets use it (CI, scripts, optional stdio “REST bridge” mode).
4. **Default vs API-key stdio:** If `DRD_API_KEY` or `API_KEY` is set to a non-empty value in the **environment of the `tymio-mcp` process**, the CLI uses a **fixed REST tool subset**, not OAuth to the hosted hub. For the **full** tool surface, use **remote** `…/mcp` or stdio **without** those env vars (after `tymio-mcp login`).
5. **Full text of this guide:** shell command `tymio-mcp instructions` (or `tymio-mcp guide`). MCP clients that support server `instructions` receive this content at initialize when using the published CLI.
6. **Bundled agent personas (PM / PO / DEV / workspace):** optional Markdown prompts ship with the package under `personas/`. **Print a prompt:** `tymio-mcp persona pm` (or `po`, `dev`, `workspace`). **Embed in MCP `instructions`:** set `TYMIO_MCP_PERSONA=pm` (same ids; `hub` aliases `workspace`) on the `tymio-mcp` process — the stdio server appends that persona after this guide so clients that honor `instructions` steer the model without Cursor Skills. **List ids:** `tymio-mcp persona list`.

---

## What `@tymio/mcp-server` is

- **Default (no API key env on the process):** A **stdio MCP server** that connects to the **hosted Tymio Streamable HTTP MCP** endpoint with **OAuth** (Google via the hub). It **proxies the full tool list** from the hub (same as using the remote URL in the IDE).
- **With `DRD_API_KEY` or `API_KEY` set:** A **REST/API-key** stdio server with a **smaller, fixed tool set** (good for CI/scripts).

---

## One-time setup (OAuth, stdio package)

1. Install: `npm install -g @tymio/mcp-server` (or run a built `dist/index.js` via `node`).
2. Run: `tymio-mcp login` — browser opens; complete Google sign-in for Tymio.
3. Tokens and OAuth client metadata live under the user config directory (e.g. Linux: `~/.config/tymio-mcp`, macOS: `~/Library/Application Support/tymio-mcp`).
4. **Callback:** default `http://127.0.0.1:19876/callback` during login — override with `TYMIO_OAUTH_PORT` if needed; keep stable for your registered OAuth client.

---

## Cursor / IDE (stdio, OAuth — recommended for this package)

Add an MCP server that runs the binary **without** `DRD_API_KEY` / `API_KEY`:

```json
{
  "mcpServers": {
    "tymio": {
      "command": "tymio-mcp",
      "args": []
    }
  }
}
```

If `tymio-mcp` is not on `PATH`, use `node` with an absolute path to `dist/index.js`.

---

## Alternative: remote MCP URL (no npm CLI)

If the host supports **URL** transport, point at the hub (OAuth handled by the IDE). Use **`/mcp`** (default active workspace after sign-in) **or** **`/t/<workspace-slug>/mcp`** to pin one workspace:

```json
{
  "mcpServers": {
    "tymio": {
      "url": "https://tymio.app/mcp"
    },
    "tymio-acme": {
      "url": "https://tymio.app/t/acme/mcp"
    }
  }
}
```

Replace the host and slug when not using production.

---

## API-key mode (REST subset, intentional)

Set `DRD_API_KEY` (or `API_KEY`) and optionally `DRD_API_BASE_URL` (default `https://tymio.app`). Then `tymio-mcp` uses the REST bridge, **not** OAuth to the hosted MCP tool list.

---

## Environment reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `TYMIO_MCP_URL` | `https://tymio.app/mcp` | Hosted MCP URL for OAuth proxy + `login` (may be `https://host/t/<slug>/mcp`; if the value has no `/mcp` suffix, the CLI appends it) |
| `TYMIO_OAUTH_PORT` | `19876` | Loopback port for login callback |
| `TYMIO_MCP_QUIET` | unset | If set, suppress stderr hints when starting stdio |
| `DRD_API_KEY` / `API_KEY` | unset | If set → API-key REST bridge (subset), not OAuth proxy |
| `DRD_API_BASE_URL` | `https://tymio.app` | Hub origin for API-key bridge |

---

## Troubleshooting

- **401 / not signed in (stdio OAuth):** Run `tymio-mcp login` again.
- **User asks where to copy MCP API key:** Explain there is **no** such key in the UI; use **remote `/mcp` or `/t/<slug>/mcp` + OAuth** or **`tymio-mcp login`**.
- **Port in use on login:** Change `TYMIO_OAUTH_PORT` and re-run `login` (redirect URI must stay consistent).
- **Help:** `tymio-mcp help` — **full guide:** `tymio-mcp instructions`

---

## Machine-readable pointers

- **JSON (public):** `GET https://tymio.app/api/mcp/agent-context` — includes `tymioMcpCliAgentGuidanceMarkdown` (this file’s contents when the server can read it from disk).
- **Markdown site summary:** `https://tymio.app/llms.txt`
- **Repository:** `mcp/README.md`, `docs/HUB.md` §6, `docs/CODING_AGENT_HANDOFF_TYMIO_APP.md`

## Workspace atlas (full MCP only)

When using **remote** `…/mcp`, remote `…/t/<slug>/mcp`, or stdio **without** `DRD_API_KEY`/`API_KEY` (OAuth proxy), the hub may expose **`tymio_get_workspace_atlas`**, **`tymio_search_workspace_objects`**, **`tymio_get_workspace_object`**, **`tymio_explain_workspace_object`**, and **`tymio_rebuild_workspace_atlas`**. These read a **compiled JSON** backlog snapshot for the active workspace — complementary to **`tymio_get_agent_brief`** (capabilities). They are **not** part of the API-key REST stdio subset.

**Public article:** `https://tymio.app/wiki/workspace-atlas` (raw: `/wiki/articles/workspace-atlas.md`). Operators: persistent **`WORKSPACE_ATLAS_DATA_DIR`** on ephemeral hosts if you want the atlas to survive process restarts without an explicit rebuild.

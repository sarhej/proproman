# Tymio MCP CLI (`@tymio/mcp-server`)

**Canonical Markdown for coding agents:** [`TYMIO_MCP_CLI_AGENT_GUIDANCE.md`](./TYMIO_MCP_CLI_AGENT_GUIDANCE.md) — same text as `tymio-mcp instructions`, MCP server `instructions` (initialize), and `GET /api/mcp/agent-context` → `tymioMcpCliAgentGuidanceMarkdown` on the hub. It states explicitly that **there is no per-user MCP API key in Tymio Settings**; use OAuth (remote `/mcp` or `tymio-mcp login`).

Installable **`tymio-mcp`** command: connect editors and agents to **Tymio** in two ways:

1. **OAuth (default)** — stdio MCP server that **proxies** the hosted **Streamable HTTP** MCP endpoint (`…/mcp`) with the same **Google → Tymio** login as the web app. **Full tool surface** matches the hub (`server/src/mcp/tools.ts`).
2. **API key (optional)** — if `DRD_API_KEY` or `API_KEY` is set, uses a **REST** bridge with a **fixed subset** of tools (see `mcp/src/apiKeyStdio.ts`).

---

## Quick start (OAuth, production)

1. Install the CLI (from npm when published, or `npm install -g /path/to/repo/mcp`).
2. In a terminal:

   ```bash
   tymio-mcp login
   ```

   A browser window opens; complete Google sign-in. Tokens and dynamic OAuth client data are stored under your user config directory (e.g. `~/.config/tymio-mcp` on Linux, or `~/Library/Application Support/tymio-mcp` on macOS).

3. Point your MCP client at stdio **without** setting `DRD_API_KEY`:

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

4. Optional: `tymio-mcp logout` removes saved OAuth files.

**Agents / IDE:** MCP clients that support [server instructions](https://modelcontextprotocol.io) receive the same long-form guide as `tymio-mcp instructions` during the initialize handshake. You can still run `tymio-mcp instructions` in a terminal to print it, or read this README.

### OAuth callback port

The CLI listens on **`http://127.0.0.1:19876/callback`** during `login` (override with `TYMIO_OAUTH_PORT`). That URI must be reachable from your browser and should stay stable so it matches the dynamically registered OAuth client.

### Hub URL

| Variable | Default | Purpose |
|----------|---------|---------|
| `TYMIO_MCP_URL` | `https://tymio.app/mcp` | Hosted MCP endpoint for OAuth proxy + `login` |

---

## API-key mode (REST subset, CI / automation)

If **`DRD_API_KEY` or `API_KEY`** is present in the environment, `tymio-mcp` **does not** use OAuth; it exposes the REST-based tool subset only.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DRD_API_BASE_URL` | `https://tymio.app` | Hub **origin** (no `/mcp`) |
| `DRD_API_KEY` / `API_KEY` | — | Bearer key (server `API_KEY`) |

Example:

```json
{
  "mcpServers": {
    "tymio-api-key": {
      "command": "tymio-mcp",
      "args": [],
      "env": {
        "DRD_API_KEY": "your-key",
        "DRD_API_BASE_URL": "https://tymio.app"
      }
    }
  }
}
```

---

## Commands

| Command | Description |
|---------|-------------|
| `tymio-mcp` | Run stdio MCP (OAuth proxy unless API key env is set) |
| `tymio-mcp login [url]` | OAuth sign-in; optional MCP URL overrides `TYMIO_MCP_URL` |
| `tymio-mcp logout` | Delete stored OAuth client + tokens |
| `tymio-mcp help` | Usage |

---

## Install globally (npm)

`npm install -g @tymio/mcp-server` works only **after** the package is published. **E404** means it is not on the registry yet. Publish from `mcp/`:

```bash
cd mcp && npm login && npm publish --access public
```

Or install from a clone:

```bash
npm install -g /absolute/path/to/proproman/mcp
```

---

## Build and run (monorepo)

```bash
npm run mcp:build
npm run mcp:start
```

From **`mcp/`**, run unit tests (uses `vitest.config.ts` in this folder):

```bash
npm test
```

From the **repo root**, use:

```bash
npx vitest run --config mcp/vitest.config.ts
```

Stdio processes are meant to be **spawned** by the MCP host, not run interactively.

---

## Direct remote MCP in Cursor (no CLI)

Your editor can use the hosted endpoint directly:

```json
{
  "mcpServers": {
    "tymio": {
      "url": "https://tymio.app/mcp"
    }
  }
}
```

Use the **CLI** when the host only supports **stdio**, or you want a single npm-installed binary that reuses disk-persisted OAuth.

---

## Publishing to npm (maintainers)

The repo includes a **manual** GitHub Actions workflow (no automatic runs on push):

- **File:** `.github/workflows/mcp-server-publish.yml`
- **How to run:** GitHub → **Actions** → **MCP server — build & publish** → **Run workflow**
- **Default:** `dry-run` — runs `npm ci`, tests, build, `npm pack`, and `npm publish --dry-run` for the `mcp` workspace
- **Real publish:** choose input `publish` and ensure the repository secret **`NPM_TOKEN`** is set (npm automation token with publish access to the **`@tymio`** scope)

Local dry-run before tagging a release:

```bash
npm run test --workspace mcp && npm run build --workspace mcp && npm publish -w mcp --access public --dry-run
```

---

## Architecture reference

Hosted MCP, OAuth, and Google callback URLs: **[docs/HUB.md](../docs/HUB.md)** §6. Hub tool implementations: `server/src/mcp/tools.ts`. OAuth proxy implementation: `mcp/src/hubProxyStdio.ts`. REST subset: `mcp/src/apiKeyStdio.ts`.

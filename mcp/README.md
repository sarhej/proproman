# Tymio MCP CLI (`@tymio/mcp-server`)

**Canonical Markdown for coding agents:** [`TYMIO_MCP_CLI_AGENT_GUIDANCE.md`](./TYMIO_MCP_CLI_AGENT_GUIDANCE.md) — same text as `tymio-mcp instructions`, MCP server `instructions` (initialize), and `GET /api/mcp/agent-context` → `tymioMcpCliAgentGuidanceMarkdown` on the hub. It states explicitly that **there is no per-user MCP API key in Tymio Settings**; use OAuth (remote `/mcp` or `tymio-mcp login`).

Installable **`tymio-mcp`** command: connect editors and agents to **Tymio** in two ways:

1. **OAuth (default)** — stdio MCP server that **proxies** the hosted **Streamable HTTP** MCP endpoint (`…/mcp` or `…/t/<workspace-slug>/mcp` via **`TYMIO_MCP_URL`**) with the same **Google → Tymio** login as the web app. **Full tool surface** matches the hub (`server/src/mcp/tools.ts`).
2. **API key (optional)** — if `DRD_API_KEY` or `API_KEY` is set, uses a **REST** bridge with a **fixed subset** of tools (see `mcp/src/apiKeyStdio.ts`). **Workspace atlas** MCP tools (`tymio_get_workspace_atlas`, etc.) are **hub-only** — use OAuth stdio or remote **`/mcp`** / **`/t/.../mcp`** for those; see `client/public/wiki/articles/workspace-atlas.md`.

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

### Bundled agent personas (PM / PO / DEV)

The package ships Markdown prompts in **`personas/`** (aligned with Cursor Skills in the monorepo).

| Mechanism | What it does |
|-----------|----------------|
| **`tymio-mcp persona list`** | Lists persona ids and usage |
| **`tymio-mcp persona pm`** (or `po`, `dev`, `workspace`) | Prints that prompt to **stdout** (pipe into docs or paste into a chat) |
| **`TYMIO_MCP_PERSONA=pm`** on the `tymio-mcp` process | **Appends** the same Markdown to MCP server **`instructions`** after the main CLI guide — steers the model for clients that honor instructions (no Skills required). Use `hub` as an alias for `workspace`. |

Example Cursor stdio config with a Product Owner bias:

```json
{
  "mcpServers": {
    "tymio-po": {
      "command": "tymio-mcp",
      "args": [],
      "env": { "TYMIO_MCP_PERSONA": "po" }
    }
  }
}
```

### OAuth callback port

The CLI listens on **`http://127.0.0.1:19876/callback`** during `login` (override with `TYMIO_OAUTH_PORT`). That URI must be reachable from your browser and should stay stable so it matches the dynamically registered OAuth client.

If **`TYMIO_OAUTH_LOGIN_TIMEOUT_MS`** is set to a positive number (milliseconds), `tymio-mcp login` stops waiting for the browser redirect after that duration instead of hanging indefinitely when the user abandons the flow. Omit it for the legacy unlimited wait.

### Hub URL

| Variable | Default | Purpose |
|----------|---------|---------|
| `TYMIO_MCP_URL` | `https://tymio.app/mcp` | Hosted MCP endpoint for OAuth proxy + `login` (may be `https://host/t/<slug>/mcp`; CLI appends `/mcp` if omitted) |

---

## API-key mode (REST subset, CI / automation)

If **`TYMIO_API_KEY`** (legacy **`DRD_API_KEY`**) or **`API_KEY`** is present in the environment, `tymio-mcp` **does not** use OAuth; it exposes the REST-based tool subset only.

| Variable | Default | Purpose |
|----------|---------|---------|
| `TYMIO_API_BASE_URL` | `https://tymio.app` | Hub **origin** (no `/mcp`; legacy `DRD_API_BASE_URL`) |
| `TYMIO_API_KEY` / `API_KEY` | — | Bearer key (server `API_KEY`; legacy `DRD_API_KEY`) |

Example:

```json
{
  "mcpServers": {
    "tymio-api-key": {
      "command": "tymio-mcp",
      "args": [],
      "env": {
        "TYMIO_API_KEY": "your-key",
        "TYMIO_API_BASE_URL": "https://tymio.app"
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
| `tymio-mcp instructions` / `guide` | Print full agent Markdown (same as MCP `instructions` base) |
| `tymio-mcp persona list` | Bundled persona ids (`pm`, `po`, `dev`, `workspace`) |
| `tymio-mcp persona <id>` | Print one persona Markdown to stdout |
| `tymio-mcp doctor` | Diagnostics: version, Node, OAuth files, masked env hints (stderr) |
| `tymio-mcp bootstrap [--help]` | Non-destructive MCP config merge for Cursor, Claude Code, OpenCode, Codex (`tymio-*` keys only); see [TYMIO_BOOTSTRAP.md](../docs/TYMIO_BOOTSTRAP.md) |
| `tymio-mcp skill list` / `show <id>` / `install <id> …` | Fetch hub-published Cursor skills from **`/skills/*`** (see `tymio-mcp skill --help`) |
| `tymio-mcp help` | Usage |

---

## Install globally (npm)

The package is published on the public registry: **[npmjs.com/package/@tymio/mcp-server](https://www.npmjs.com/package/@tymio/mcp-server)**. See [`CHANGELOG.md`](./CHANGELOG.md) for the current release line.

```bash
npm install -g @tymio/mcp-server
```

Or run without a global install:

```bash
npx @tymio/mcp-server help
```

**Maintainers — publish a new version** (from monorepo root, after bumping `mcp/package.json` and updating `CHANGELOG.md`):

```bash
npm login
npm publish -w mcp --access public
```

Or install from a local clone (development):

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

**Local smoke (vendor CLIs)** — dry-run bootstrap for Cursor / Claude Code / Codex in temp dirs, optional `WRITE=1` + `cursor agent mcp list` / `claude mcp list` / `codex mcp list`: see [LOCAL_AGENT_CLIENTS_SMOKE.md](../docs/LOCAL_AGENT_CLIENTS_SMOKE.md). From repo root: `npm run local:agent-clients`.

**Deep smoke (live hub MCP)** — `npm run smoke:deep` in this package runs `deeperSmoke` (OAuth on disk, `tools/list` on discovery or `…/t/<slug>/mcp`). See [LOCAL_AGENT_CLIENTS_SMOKE.md](../docs/LOCAL_AGENT_CLIENTS_SMOKE.md) § Deep testing.

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

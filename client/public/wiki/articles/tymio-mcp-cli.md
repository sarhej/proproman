# `tymio-mcp` CLI — install and use

The npm package **`@tymio/mcp-server`** installs the **`tymio-mcp`** command. It runs a **stdio** MCP server that **proxies** Tymio’s hosted **`/mcp`** endpoint using **OAuth** (same Google sign-in as the web app). You get the **full hub tool list**, not the smaller REST subset.

There is **no personal “MCP API key”** in Tymio Settings — use **`tymio-mcp login`** (or a remote MCP URL in clients that support it).

---

## Install

From the public registry:

```bash
npm install -g @tymio/mcp-server
```

Check:

```bash
tymio-mcp help
```

If the package is not published yet on your registry, use a path or monorepo install (see the package README). You can also run via **`npx`** without a global install:

```bash
npx @tymio/mcp-server help
```

---

## First-time setup (OAuth)

1. **Sign in once** (opens a browser):

   ```bash
   tymio-mcp login
   ```

   Optional: `tymio-mcp login https://your-host/mcp` or `tymio-mcp login https://your-host/t/your-workspace-slug/mcp` to override the default hub MCP URL (workspace-pinned URL is supported).

2. **Token storage** — OAuth client data and tokens are saved under your user config directory, for example:

   - **macOS:** `~/Library/Application Support/tymio-mcp`
   - **Linux:** `~/.config/tymio-mcp`

3. **Callback URL** — during `login`, the CLI listens on **`http://127.0.0.1:19876/callback`** (override with **`TYMIO_OAUTH_PORT`**). Your browser must reach that address on the same machine.

4. **Point your MCP client** at stdio — **do not** set `DRD_API_KEY` / `API_KEY` on the process unless you intentionally want API-key mode (see below).

Example **Cursor-style** config:

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

If `tymio-mcp` is not on `PATH`, use the full path to the binary or `npx @tymio/mcp-server` as `command` with appropriate `args`.

When the client shows the server as **connected** (e.g. green), the agent can call Tymio tools as your signed-in user (same roles as in the browser).

---

## Day-to-day use

| What happens | What you do |
|----------------|-------------|
| **Normal use** | Nothing — your IDE or agent **starts `tymio-mcp` as a subprocess** when it needs MCP. You chat / work as usual. |
| **Tokens expired or revoked** | Run **`tymio-mcp login`** again and complete the browser flow. |
| **Switch Google account** | **`tymio-mcp logout`** then **`tymio-mcp login`**. |
| **See the full agent guide in a terminal** | **`tymio-mcp instructions`** (same base text as MCP server `instructions`). |

---

## Useful commands

| Command | Purpose |
|---------|---------|
| `tymio-mcp` | Start stdio MCP (OAuth proxy; default when no API-key env) |
| `tymio-mcp login [url]` | Browser OAuth; optional URL overrides default MCP endpoint |
| `tymio-mcp logout` | Remove saved OAuth client + tokens locally |
| `tymio-mcp instructions` | Print long Markdown guide for humans and agents |
| `tymio-mcp persona list` | List bundled personas (`pm`, `po`, `dev`, `workspace`) |
| `tymio-mcp persona <id>` | Print one persona Markdown to stdout |
| `tymio-mcp help` | Short usage summary |

---

## Environment variables (common)

| Variable | Purpose |
|----------|---------|
| **`TYMIO_MCP_URL`** | Hosted MCP URL for OAuth proxy + login (default `https://tymio.app/mcp`). May be **`https://<host>/t/<workspace-slug>/mcp`** to pin the session workspace; the CLI normalizes a missing trailing `/mcp` when you pass only the origin + `/t/...` segment. |
| **`TYMIO_OAUTH_PORT`** | Loopback port for login callback (default `19876`). |
| **`TYMIO_MCP_PERSONA`** | Set to `pm`, `po`, `dev`, or `workspace` to **append** that persona to MCP **instructions** (steers the model in clients that honor instructions). |
| **`TYMIO_WORKSPACE_SLUG`** | Pins the CLI to one workspace slug if your setup requires it (see package README). |

Example with a **Product Owner** bias (in MCP `env`):

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

---

## API-key mode (optional, narrower tool set)

If **`DRD_API_KEY`** or **`API_KEY`** is set on the **`tymio-mcp` process**, the CLI uses a **REST bridge** with a **fixed subset** of tools — useful for CI or automation. That key is the **server deployment** secret, not something users copy from Tymio Settings.

Typical env:

- **`DRD_API_BASE_URL`** — hub origin (e.g. `https://tymio.app`, no `/mcp`).
- **`DRD_API_KEY`** / **`API_KEY`** — Bearer value matching server **`API_KEY`**.

For the **full** tool surface, omit those variables and use OAuth (`login`).

---

## See also

- [MCP connection overview](/wiki/mcp-connection) — remote URL vs stdio vs automation.
- [OpenClaw gateway setup](/wiki/openclaw) — registering `tymio-mcp` on the gateway host.

Raw Markdown: **`/wiki/articles/tymio-mcp-cli.md`** on this host.

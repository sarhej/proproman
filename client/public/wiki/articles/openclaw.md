# OpenClaw gateway setup

[OpenClaw](https://docs.openclaw.ai/) is a self-hosted agent runtime. Tymio connects through **MCP** like any other client. On OpenClaw, MCP servers are usually registered under **`mcp.servers`** in **`~/.openclaw/openclaw.json`** (or via **`openclaw mcp set`**).

## Recommended: stdio + `tymio-mcp`

OpenClaw typically runs MCP as a **local subprocess** (stdio). The published package **`@tymio/mcp-server`** provides the **`tymio-mcp`** command: it performs **OAuth in the browser** once, stores tokens on the gateway host, and proxies Tymio’s hosted MCP tool surface (default **`/mcp`**; optional workspace URL **`/t/<workspace-slug>/mcp`** via **`TYMIO_MCP_URL`** or **`tymio-mcp login <url>`**).

Full **install, login, daily use, and commands** are documented here: **[tymio-mcp CLI — install and use](/wiki/tymio-mcp-cli)**.

### Steps

1. Install the CLI on the **gateway host** (same machine that runs OpenClaw), e.g.  
   `npm install -g @tymio/mcp-server`
2. Run **`tymio-mcp login`** and complete Google sign-in.
3. Register the server with OpenClaw, then **restart the gateway**.

### Example (OpenClaw CLI)

```bash
openclaw mcp set tymio '{"command":"tymio-mcp","args":[],"description":"Tymio product hub (OAuth via tymio-mcp login)"}'
```

Adjust if `tymio-mcp` is not on `PATH` (use the full path to the binary or `npx` with a pinned version).

### Optional personas

Set **`TYMIO_MCP_PERSONA`** to **`pm`**, **`po`**, **`dev`**, or **`workspace`** on the **`tymio-mcp`** process to append role-oriented instructions (see the package README).

## Remote URL on OpenClaw (advanced)

Some OpenClaw versions support **remote** MCP entries (`url` + optional **`transport": "streamable-http"`**). Tymio’s endpoint uses **Streamable HTTP** and **OAuth**. Only use this path if your OpenClaw build documents **end-to-end OAuth** for outbound remote MCP; otherwise stay on **stdio + `tymio-mcp`**.

## Discoverability

Tymio-related skills and packages may be published to **ClawHub** (`openclaw skills search`, `clawhub` CLI). See OpenClaw docs: [ClawHub](https://docs.openclaw.ai/tools/clawhub).

## Raw Markdown

This article is also available at **`/wiki/articles/openclaw.md`** on the same host.

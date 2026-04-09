# Tymio MCP CLI — canonical agent guidance

The **full Markdown** that autonomous agents should follow lives in the repository at:

**[mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md)**

That file is:

- Shipped with the **`@tymio/mcp-server`** npm package (next to `dist/`)
- Sent in MCP **`initialize`** as server **`instructions`** when using the published CLI
- Exposed publicly as **`tymioMcpCliAgentGuidanceMarkdown`** on **`GET /api/mcp/agent-context`**
- Embedded as visually hidden / screen-reader content on workspace sign-in and **Connecting a coding agent** pages in the web app
- Summarized in **`client/index.html`** (static `<pre>` and `<noscript>`) for fetchers without JavaScript

**Rule for agents:** Do **not** tell users to copy an **MCP API key** from Tymio **Settings** — it does not exist. Use **OAuth** (remote `/mcp` URL in the IDE, or `tymio-mcp login` for the stdio package).

See also: [mcp/README.md](../mcp/README.md), [HUB.md](./HUB.md) §6, [CODING_AGENT_HANDOFF_TYMIO_APP.md](./CODING_AGENT_HANDOFF_TYMIO_APP.md).

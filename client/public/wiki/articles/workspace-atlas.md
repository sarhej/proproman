# Workspace atlas (compiled backlog snapshot for agents)

The **workspace atlas** is a **compiled, read-optimized snapshot** of one workspace’s **backlog graph** (domains, products, initiatives, features, requirements) plus pointers into the **capability** ontology. It is **materialized on the server** as JSON files and exposed through **MCP tools** on the **full** hub MCP surface (remote `/mcp` or stdio **`tymio-mcp`** after OAuth — **not** the API-key REST subset).

## What it is (and is not)

| | |
|--|--|
| **Is** | Deterministic JSON: a compact **atlas index** (`workspace-atlas.json`) and **per-object shards** (one JSON file per domain, product, initiative, feature, or requirement). Built from the **same PostgreSQL data** as the UI and `drd_*` tools. |
| **Is not** | Not RAG over arbitrary documents. Not a replacement for **`tymio_get_agent_brief`** (that’s the **capability** map: routes, tools, models). Not the source of truth — the **hub database** is; recompile or wait for debounced rebuild after changes. |

**Relationship to ontology:** Use **`tymio_get_agent_brief`** / **`tymio_list_capabilities`** for “what does the product expose?” Use the **workspace atlas** for “what work exists in *this* workspace?” (titles, links, graph structure, facts on each object).

## When to use which MCP tool

1. **`tymio_get_workspace_atlas`** — First step for token-efficient orientation: indices, ids, titles, and graph handles. If the response contains **`error: "not_built"`**, run **`tymio_rebuild_workspace_atlas`** once (requires **EDITOR+** in that workspace) or wait for the server’s debounced rebuild after a hub change.
2. **`tymio_search_workspace_objects`** — Short **keyword** search over atlas title indices (case-insensitive substring). Not semantic search.
3. **`tymio_get_workspace_object`** — Full **shard** for one `DOMAIN` | `PRODUCT` | `INITIATIVE` | `FEATURE` | `REQUIREMENT` by `id` (ids from atlas or `drd_*` lists).
4. **`tymio_explain_workspace_object`** — Same shard as (3), optionally wrapped in a short natural-language explanation **if** the deployment enables the LLM path (see operators below). If LLM is off, you still get the structured shard.
5. **`tymio_rebuild_workspace_atlas`** — Forces a full recompile from the database. **EDITOR+** (or platform super-admin). Use after migrations, if you see **`not_built`**, or when you need guaranteed freshness before debounce.

**`workspaceSlug`:** Every atlas tool requires **`workspaceSlug`** and it **must match** the active MCP session workspace (cross-workspace calls are rejected).

## Operators: environment and hosting

| Variable | Role |
|----------|------|
| `WORKSPACE_ATLAS_DATA_DIR` | Directory for `workspace-atlas.json` and shard files. Default under the server process (e.g. `server/data/workspace-atlas`). On **ephemeral** hosts (many PaaS disks), set a **persistent volume** path or accept that the atlas is **rebuilt** after restarts (still correct, may be cold until rebuild or first hub event). |
| `WORKSPACE_ATLAS_DEBOUNCE_MS` | Milliseconds to wait after hub change notifications before rebuilding (default ~2000). |
| `WORKSPACE_ATLAS_LLM_ENABLED` | When `true` and an OpenAI key is set, **`tymio_explain_workspace_object`** may call the model. |
| `WORKSPACE_ATLAS_OPENAI_API_KEY` | OpenAI API key for explain only (separate from other app keys if you want). |
| `WORKSPACE_ATLAS_OPENAI_MODEL` | Model id (default `gpt-4o-mini`). |

Configure these on the **server** (e.g. Railway service variables), not in end-user Tymio Settings.

## Privacy and data sensitivity

Shards can include **PII** present in the hub (for example **owner name or email** on initiatives). Treat MCP outputs like any other authenticated hub export.

## API-key / CI stdio mode

The published **`@tymio/mcp-server`** **REST bridge** (`DRD_API_KEY` / `API_KEY` on the process) exposes a **fixed subset** of tools. **Workspace atlas tools are not in that subset.** Use **remote MCP** or stdio **without** those env vars (OAuth proxy) to get **`tymio_*` atlas** tools.

## Further reading (repository)

- Product overview and MCP section: `docs/HUB.md` §6 (capability brief + workspace atlas).
- Portable agent handoff (tool lists): `docs/CODING_AGENT_HANDOFF_TYMIO_APP.md`.
- Cursor skill (workflow): `.cursor/skills/tymio-workspace/SKILL.md`.

Raw Markdown URL on this host: **`/wiki/articles/workspace-atlas.md`**.

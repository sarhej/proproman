# Tymio MCP rename — drop `drd_*` legacy namespace

**Status:** implemented in this repository — hub MCP tools use `tymio_*`; `@tymio/mcp-server` **2.1.0+** (see [mcp/CHANGELOG.md](../mcp/CHANGELOG.md)). Env vars: prefer `TYMIO_*`; legacy `DRD_*` still supported in the CLI with a one-time deprecation warning. **Overall roadmap:** [TYMIO_IMPLEMENTATION_STATUS.md](TYMIO_IMPLEMENTATION_STATUS.md).
**Owner:** product / core MCP.
**Target release:** `@tymio/mcp-server` **v2.1.0** (flagged breaking in `CHANGELOG.md` despite the minor bump — acceptable because there are effectively no external users yet).

## Why

The `drd_*` tool-name prefix is a leftover from the original project name (DrDigital). Every MCP backlog tool still carries it, while newer capability and atlas tools already use `tymio_*`. The mixed namespace is a daily cognitive tax on agents and documentation (see wording in [.cursor/skills/tymio-workspace/SKILL.md](../.cursor/skills/tymio-workspace/SKILL.md): "drd_* or workspace tymio_* tools").

Decision: **hard rename, no aliases, no deprecation window.** Single PR, one release.

## Audit summary — what is in scope and what is not

Scope is smaller than it looks because the legacy prefix never leaked beyond the MCP surface and environment vars.

In scope:

- 80 MCP tool names registered in [server/src/mcp/tools.ts](../server/src/mcp/tools.ts) (full list below).
- The REST-subset stdio variant in [mcp/src/apiKeyStdio.ts](../mcp/src/apiKeyStdio.ts) (mirrors a subset of the same names).
- Environment variables `DRD_API_KEY`, `DRD_API_BASE_URL`, `DRD_WORKSPACE_SLUG`.
- All documentation that references the old names: [client/public/llms.txt](../client/public/llms.txt), wiki articles under [client/public/wiki/articles/](../client/public/wiki/articles/), [mcp/README.md](../mcp/README.md), [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md), [docs/HUB.md](HUB.md), [docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md](TYMIO_AGENT_ROLES_PM_PO_DEV.md), [docs/CODING_AGENT_TYMIO.md](CODING_AGENT_TYMIO.md), [docs/CODING_AGENT_HANDOFF_TYMIO_APP.md](CODING_AGENT_HANDOFF_TYMIO_APP.md).
- Cursor skills at [.cursor/skills/tymio-workspace/](../.cursor/skills/tymio-workspace/), [.cursor/skills/tymio-pm-agent/](../.cursor/skills/tymio-pm-agent/), [.cursor/skills/tymio-po-agent/](../.cursor/skills/tymio-po-agent/), [.cursor/skills/tymio-dev-agent/](../.cursor/skills/tymio-dev-agent/).
- Bundled personas at [mcp/personas/](../mcp/personas/).
- i18n UI strings: `client/src/i18n/{cs,en,pl,sk,uk}.json`.
- All `server/src/mcp/*.test.ts` test files.
- [server/src/mcp/registeredMcpToolNames.ts](../server/src/mcp/registeredMcpToolNames.ts) + its sync test.

Out of scope (confirmed clean by audit):

- Prisma schema and migrations — no `drd_*` table or column names.
- REST routes — no `/api/drd/...` paths exist.
- npm package namespace — already `@tymio`, not `@drd`.
- [docs/EXECUTION_BOARDS_DRDIGITAL_BACKPORT.md](EXECUTION_BOARDS_DRDIGITAL_BACKPORT.md) — historical backport note; file name kept for provenance, content may reference DrDigital as the prior product name. Separate decision if we want to archive or rename that doc.
- `API_KEY` (unprefixed) — retained as a fallback auth env var in the server; not a rename target.

## Tool-name rename table

Nearly all are a pure prefix swap `drd_` → `tymio_`. Two have additional changes:

- `drd_set_dr_hub_epic_implementation_notes` → **`tymio_set_epic_implementation_notes`** (also drops the `dr_hub_` substring — same legacy origin).
- `drd_meta` → **`tymio_meta`** (no further change; `tymio_workspace_meta` was considered and rejected to keep names short).

The 80 renames are enumerated below for the PR checklist. Source of truth: [server/src/mcp/registeredMcpToolNames.ts](../server/src/mcp/registeredMcpToolNames.ts).

### CRUD tools (create / update / delete / upsert / reorder / move / set)

- `drd_create_campaign` → `tymio_create_campaign`
- `drd_create_campaign_link` → `tymio_create_campaign_link`
- `drd_create_decision` → `tymio_create_decision`
- `drd_create_dependency` → `tymio_create_dependency`
- `drd_create_domain` → `tymio_create_domain`
- `drd_create_execution_board` → `tymio_create_execution_board`
- `drd_create_execution_column` → `tymio_create_execution_column`
- `drd_create_feature` → `tymio_create_feature`
- `drd_create_initiative` → `tymio_create_initiative`
- `drd_create_kpi` → `tymio_create_kpi`
- `drd_create_milestone` → `tymio_create_milestone`
- `drd_create_product` → `tymio_create_product`
- `drd_create_requirement` → `tymio_create_requirement`
- `drd_create_risk` → `tymio_create_risk`
- `drd_create_stakeholder` → `tymio_create_stakeholder`
- `drd_delete_assignment` → `tymio_delete_assignment`
- `drd_delete_campaign` → `tymio_delete_campaign`
- `drd_delete_campaign_link` → `tymio_delete_campaign_link`
- `drd_delete_decision` → `tymio_delete_decision`
- `drd_delete_dependency` → `tymio_delete_dependency`
- `drd_delete_execution_board` → `tymio_delete_execution_board`
- `drd_delete_execution_column` → `tymio_delete_execution_column`
- `drd_delete_feature` → `tymio_delete_feature`
- `drd_delete_initiative` → `tymio_delete_initiative`
- `drd_delete_kpi` → `tymio_delete_kpi`
- `drd_delete_milestone` → `tymio_delete_milestone`
- `drd_delete_product` → `tymio_delete_product`
- `drd_delete_requirement` → `tymio_delete_requirement`
- `drd_delete_risk` → `tymio_delete_risk`
- `drd_delete_stakeholder` → `tymio_delete_stakeholder`
- `drd_update_assignment` → `tymio_update_assignment`
- `drd_update_campaign` → `tymio_update_campaign`
- `drd_update_execution_board` → `tymio_update_execution_board`
- `drd_update_execution_column` → `tymio_update_execution_column`
- `drd_update_feature` → `tymio_update_feature`
- `drd_update_initiative` → `tymio_update_initiative`
- `drd_update_kpi` → `tymio_update_kpi`
- `drd_update_milestone` → `tymio_update_milestone`
- `drd_update_product` → `tymio_update_product`
- `drd_update_requirement` → `tymio_update_requirement`
- `drd_update_stakeholder` → `tymio_update_stakeholder`
- `drd_upsert_assignment` → `tymio_upsert_assignment`
- `drd_upsert_requirement` → `tymio_upsert_requirement`
- `drd_move_feature` → `tymio_move_feature`
- `drd_reorder_execution_columns` → `tymio_reorder_execution_columns`
- `drd_reorder_features` → `tymio_reorder_features`
- `drd_reorder_initiatives` → `tymio_reorder_initiatives`
- `drd_reorder_requirements` → `tymio_reorder_requirements`
- `drd_set_execution_layout` → `tymio_set_execution_layout`
- `drd_set_dr_hub_epic_implementation_notes` → **`tymio_set_epic_implementation_notes`**

### Read tools (list / get / search / timeline / health / meta)

- `drd_get_campaign` → `tymio_get_campaign`
- `drd_get_initiative` → `tymio_get_initiative`
- `drd_get_product_tree` → `tymio_get_product_tree`
- `drd_health` → `tymio_health`
- `drd_list_accounts` → `tymio_list_accounts`
- `drd_list_assets` → `tymio_list_assets`
- `drd_list_assignments` → `tymio_list_assignments`
- `drd_list_campaign_links` → `tymio_list_campaign_links`
- `drd_list_campaigns` → `tymio_list_campaigns`
- `drd_list_decisions` → `tymio_list_decisions`
- `drd_list_demands` → `tymio_list_demands`
- `drd_list_dependencies` → `tymio_list_dependencies`
- `drd_list_domains` → `tymio_list_domains`
- `drd_list_execution_boards` → `tymio_list_execution_boards`
- `drd_list_features` → `tymio_list_features`
- `drd_list_initiatives` → `tymio_list_initiatives`
- `drd_list_kpis` → `tymio_list_kpis`
- `drd_list_milestones` → `tymio_list_milestones`
- `drd_list_partners` → `tymio_list_partners`
- `drd_list_personas` → `tymio_list_personas`
- `drd_list_products` → `tymio_list_products`
- `drd_list_requirements` → `tymio_list_requirements`
- `drd_list_revenue_streams` → `tymio_list_revenue_streams`
- `drd_list_risks` → `tymio_list_risks`
- `drd_list_stakeholders` → `tymio_list_stakeholders`
- `drd_meta` → **`tymio_meta`**
- `drd_search_features` → `tymio_search_features`
- `drd_search_initiatives` → `tymio_search_initiatives`
- `drd_search_requirements` → `tymio_search_requirements`
- `drd_timeline_calendar` → `tymio_timeline_calendar`
- `drd_timeline_gantt` → `tymio_timeline_gantt`

### Already canonical — no change

These were added after the rebrand and already use the `tymio_*` namespace. Listed for completeness so reviewers can confirm nothing here collides with a renamed tool:

- `tymio_explain_workspace_object`
- `tymio_get_agent_brief`
- `tymio_get_capability`
- `tymio_get_coding_agent_guide`
- `tymio_get_workspace_atlas`
- `tymio_get_workspace_object`
- `tymio_list_capabilities`
- `tymio_rebuild_workspace_atlas`
- `tymio_search_workspace_objects`

Collision check: none of the renamed `tymio_*` names match any existing `tymio_*` name above.

## Environment variable rename

| Legacy | Canonical |
| --- | --- |
| `DRD_API_KEY` | `TYMIO_API_KEY` |
| `DRD_API_BASE_URL` | `TYMIO_API_BASE_URL` |
| `DRD_WORKSPACE_SLUG` | `TYMIO_WORKSPACE_SLUG` (already supported; drop the `DRD_*` alias) |

`API_KEY` (unprefixed, server-side deployment secret) is **unchanged** — it was never `DRD_*` scoped and continues to work as the server-operator fallback.

Impact of env rename:

- CLI API-key detection at [mcp/src/cli.ts](../mcp/src/cli.ts) L10 — `useApiKeyBridge()` must read `TYMIO_API_KEY` first, fall back to `API_KEY`. Drop `DRD_API_KEY` read.
- [mcp/src/apiKeyStdio.ts](../mcp/src/apiKeyStdio.ts) header comment (L2–L3) — update to the canonical names.
- [mcp/src/workspaceSlug.ts](../mcp/src/workspaceSlug.ts) — stop accepting `DRD_WORKSPACE_SLUG`.

## Places that must change in the rename PR

Grouped by file family. Every line referencing the legacy names should be touched in the same PR — the rename is only "clean" if the repo ships coherent.

### Server

- [server/src/mcp/tools.ts](../server/src/mcp/tools.ts) — 80 `server.registerTool("drd_...", ...)` calls renamed. Also the tool title strings and descriptions where they self-reference (e.g. "Use `drd_list_features` to ...").
- [server/src/mcp/registeredMcpToolNames.ts](../server/src/mcp/registeredMcpToolNames.ts) — array rewritten; existing sync test `registeredMcpToolNames.test.ts` verifies this against `tools.ts`.
- [server/src/mcp/globalMcpTools.ts](../server/src/mcp/globalMcpTools.ts) — 2 hits.
- [server/src/services/ontologyRefresh.ts](../server/src/services/ontologyRefresh.ts) — 12 hits; agent-brief recompile must be triggered after merge so the precompiled brief returned by `tymio_get_agent_brief` advertises canonical names.
- [server/src/lib/mcpAgentContextPayload.ts](../server/src/lib/mcpAgentContextPayload.ts) — payload shape references; update tests in the same commit.
- `server/src/mcp/*.test.ts` — at least seven test files parameterize tool-name usage; search and rewrite.

### CLI / npm package

- [mcp/src/apiKeyStdio.ts](../mcp/src/apiKeyStdio.ts) — 34 `server.registerTool("drd_...")` calls + the header comment.
- [mcp/src/hubProxyStdio.ts](../mcp/src/hubProxyStdio.ts) — 2 hits.
- [mcp/src/cli.ts](../mcp/src/cli.ts) — env-var detection.
- [mcp/src/cliMessages.ts](../mcp/src/cliMessages.ts) — 5 hits in help text.
- [mcp/src/stdioHints.ts](../mcp/src/stdioHints.ts) — 2 hits.
- [mcp/src/api.ts](../mcp/src/api.ts) + [mcp/src/api.test.ts](../mcp/src/api.test.ts) — rename `drdFetch` / `drdFetchText` helpers to `tymioFetch` / `tymioFetchText` and their test references.
- [mcp/src/workspaceSlug.ts](../mcp/src/workspaceSlug.ts) + [mcp/src/workspaceSlug.test.ts](../mcp/src/workspaceSlug.test.ts) — env-var fallback removal.
- [mcp/src/cli.test.ts](../mcp/src/cli.test.ts) — 7 hits.
- [mcp/src/hubProxyStdio.test.ts](../mcp/src/hubProxyStdio.test.ts) — 8 hits.
- [mcp/personas/](../mcp/personas/) — `pm.md` (15 hits), `po.md` (7), `dev.md`, `workspace.md` — example tool calls rewritten.
- [mcp/README.md](../mcp/README.md) — 7 hits.
- [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md) — 5 hits.
- [mcp/CHANGELOG.md](../mcp/CHANGELOG.md) — add v2.1.0 entry (text template below).

### Client / public surfaces

- [client/public/llms.txt](../client/public/llms.txt) — rewrite any named tool references; CDN / edge cache must be invalidated at release time.
- [client/public/wiki/articles/mcp-connection.md](../client/public/wiki/articles/mcp-connection.md), [client/public/wiki/articles/workspace-atlas.md](../client/public/wiki/articles/workspace-atlas.md), [client/public/wiki/articles/tymio-mcp-cli.md](../client/public/wiki/articles/tymio-mcp-cli.md) — rewrite tool-name examples and env-var references.
- [client/src/i18n/{cs,en,pl,sk,uk}.json](../client/src/i18n/) — find any user-facing strings referencing the old env-var names; translate for each locale.
- [client/src/components/agent/AgentMcpCliHiddenGuidance.tsx](../client/src/components/agent/AgentMcpCliHiddenGuidance.tsx) — references to env vars.
- [client/src/pages/admin/OntologyTab.tsx](../client/src/pages/admin/OntologyTab.tsx) — 1 hit.
- [client/index.html](../client/index.html) — 3 hits for env-var mentions.

### Cursor skills

Rewritten in the same PR so the repo's own skills do not lie to agents at HEAD:

- [.cursor/skills/tymio-workspace/SKILL.md](../.cursor/skills/tymio-workspace/SKILL.md) — 19 hits.
- [.cursor/skills/tymio-workspace/references/mcp-and-rest.md](../.cursor/skills/tymio-workspace/references/mcp-and-rest.md) — 40 hits.
- [.cursor/skills/tymio-workspace/references/tymio-hub-ontology.md](../.cursor/skills/tymio-workspace/references/tymio-hub-ontology.md) — 5 hits.
- [.cursor/skills/tymio-po-agent/SKILL.md](../.cursor/skills/tymio-po-agent/SKILL.md) — 19 hits.
- [.cursor/skills/tymio-dev-agent/SKILL.md](../.cursor/skills/tymio-dev-agent/SKILL.md) — 11 hits.
- [.cursor/skills/tymio-pm-agent/SKILL.md](../.cursor/skills/tymio-pm-agent/SKILL.md) — hits in "Primary workflows".

### Root-level docs

- [docs/HUB.md](HUB.md) — 4 hits.
- [docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md](TYMIO_AGENT_ROLES_PM_PO_DEV.md) — 37 hits.
- [docs/CODING_AGENT_TYMIO.md](CODING_AGENT_TYMIO.md) — 9 hits + 1 env hit.
- [docs/CODING_AGENT_HANDOFF_TYMIO_APP.md](CODING_AGENT_HANDOFF_TYMIO_APP.md) — 67 hits.
- [docs/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](TYMIO_MCP_CLI_AGENT_GUIDANCE.md) — mirror of the canonical copy in `mcp/`; keep in sync.
- [README.md](../README.md) — 1 hit.

## Cutover checklist

1. **Single PR** across server, CLI, client, skills, personas, and docs — no partial merges. The codebase should not spend a minute with the MCP server registering `tymio_*` while docs still say `drd_*`.
2. **Tests**: sweep and rewrite all `drd_*` references in `server/src/mcp/*.test.ts` and `mcp/src/*.test.ts`. The sync test `registeredMcpToolNames.test.ts` will flag any mismatch between `tools.ts` and the exported array.
3. **Agent brief**: after merge, run the refresh entrypoint in [server/src/services/ontologyRefresh.ts](../server/src/services/ontologyRefresh.ts) so the precompiled brief returned by `tymio_get_agent_brief` advertises the canonical names. Deploy the hub change before publishing the CLI so clients never see a stale brief.
4. **`client/public/llms.txt`**: build and deploy alongside the server change; invalidate CDN / edge cache explicitly.
5. **Wiki articles** under `client/public/wiki/articles/`: same bundle as `llms.txt` (they are served from the same static directory).
6. **Cursor skills**: update the four `.cursor/skills/tymio-*` directories so the repo self-documents at the new names.
7. **Personas**: rewrite `mcp/personas/*.md`. These are bundled into the npm tarball; a CLI rebuild is required.
8. **CLI build & publish**:
    - Bump [mcp/package.json](../mcp/package.json) to `2.1.0`.
    - Update [mcp/CHANGELOG.md](../mcp/CHANGELOG.md) with the v2.1.0 entry (template below).
    - Run `npm run test --workspace mcp && npm run build --workspace mcp`.
    - Dry-run: `npm publish -w mcp --access public --dry-run`.
    - Real publish via the manual GitHub Action `.github/workflows/mcp-server-publish.yml` with input `publish` and the `NPM_TOKEN` secret set.
9. **Announcement** (internal only — no external users yet): single note in the team channel linking this doc and the new `CHANGELOG.md` entry. Nothing to email; nothing to version-gate on external users.
10. **Post-merge smoke test**: connect Cursor to `https://tymio.app/t/<slug>/mcp`, call `tymio_health`, `tymio_meta`, `tymio_list_initiatives`. All three must return 200 with no deprecation warnings.

## CHANGELOG template (v2.1.0)

Proposed text for [mcp/CHANGELOG.md](../mcp/CHANGELOG.md):

```markdown
## 2.1.0

### Breaking (no alias, no deprecation window)

- **All `drd_*` MCP tools renamed to `tymio_*`.** Unified namespace. Full rename map: see `docs/TYMIO_MCP_RENAME.md`. Two special cases:
  - `drd_set_dr_hub_epic_implementation_notes` → `tymio_set_epic_implementation_notes` (also drops the `dr_hub_` substring).
  - `drd_meta` → `tymio_meta`.
- **Environment variables renamed:**
  - `DRD_API_KEY` → `TYMIO_API_KEY`.
  - `DRD_API_BASE_URL` → `TYMIO_API_BASE_URL`.
  - `DRD_WORKSPACE_SLUG` → `TYMIO_WORKSPACE_SLUG`.
- **Impact:** any script or MCP client config that references a `drd_*` tool name or `DRD_*` env var must be updated. `API_KEY` (unprefixed, server-side) is unchanged.

### Why

Legacy from the original DrDigital project. Removing now while there are no external integrations is the cheapest moment.

### Verify

Reconnect your MCP client and call `tymio_health`. If your agent still asks for `drd_health`, its cached brief is stale — trigger a fresh `tymio_get_agent_brief`.
```

## Post-rename validation

After the PR is merged and published:

1. `npx @tymio/mcp-server@2.1.0 instructions` contains only `tymio_*` names.
2. `GET https://tymio.app/api/mcp/agent-context` returns `tymioMcpCliAgentGuidanceMarkdown` with no `drd_*` occurrences.
3. `GET https://tymio.app/llms.txt` has no `drd_*` occurrences.
4. Fresh Cursor session using [.cursor/mcp.json](../.cursor/mcp.json) against `https://tymio.app/t/tymio/mcp` lists tools with only the canonical names.
5. Any broken search: `rg -n 'drd_|DRD_API|DRD_WORKSPACE_SLUG' --glob '!docs/EXECUTION_BOARDS_DRDIGITAL_BACKPORT.md'` returns nothing.

## Follow-ups (not required for this rename)

- Consider archiving or renaming [docs/EXECUTION_BOARDS_DRDIGITAL_BACKPORT.md](EXECUTION_BOARDS_DRDIGITAL_BACKPORT.md) — historical provenance only.
- The `DR_HUB_EPIC_NOTES` constant inside [server/src/mcp/tools.ts](../server/src/mcp/tools.ts) (around L460) is a hard-coded one-off for the "Tymio demo hub" product. Rename the constant to `TYMIO_DEMO_HUB_EPIC_NOTES` while touching the file; no behavior change.

# Tymio implementation status — MCP / CLI / agent onboarding

**Last updated:** 2026-04-19 (repository + npm registry; hub deploy verified separately).

## Hub context (Tymio workspace / product)

Per [HUB.md](HUB.md) § internal product lines, **`@tymio/mcp-server`** / **`tymio-mcp`** roadmap work is tracked under the **CLI-NPM** product (`cli-npm`) in the **Tymio** org workspace (`tymio`), alongside **Tymio Web App** (`tymio-web-app`).

**Suggested hub updates (manual, PO-owned):** when a phase below ships, link the matching **Initiative / Feature / Requirement** in that product and set status or notes (e.g. “Rename + CLI **2.2.0** shipped on npm; hub deploy **verified**”). This file is the engineering source of truth; the hub is the stakeholder-facing record.

## Phase map

| Phase | What | Status |
| ----- | ---- | ------ |
| **1** | **Rename:** MCP tools `drd_*` → `tymio_*`, env prefer `TYMIO_*`, legacy `DRD_*` fallback in CLI | **Done** in this repo (`docs/TYMIO_MCP_RENAME.md`). Shipped on npm as **@tymio/mcp-server@2.2.0** (there is no separate **2.1.0** on the registry — versions jump **2.0.1 → 2.2.0**). |
| **2** | **Deploy hub:** production serves new tool names + updated `llms.txt` / agent-context | **Next** unless already verified: operator deploy + smoke test `tools/list` on live `…/mcp` for **`tymio_*`** (not **`drd_*`**). |
| **3** | **Publish CLI:** **@tymio/mcp-server@2.2.0** (rename + `doctor` / `bootstrap --help` preview) | **Done** on npm ([registry](https://www.npmjs.com/package/@tymio/mcp-server)). |
| **4** | **Bootstrap backend:** `GET /skills/*`, `tymio_install_skill` / `tymio_list_skills`, `GET /.well-known/opencode` — see [TYMIO_BOOTSTRAP.md](TYMIO_BOOTSTRAP.md) | **Done** in repo — public **`/skills/*`**, MCP skill tools, **`GET /.well-known/opencode`** (OpenCode remote MCP defaults). Deploy hub to expose live. |
| **5** | **Bootstrap CLI (remainder):** full `bootstrap` (client detection + non-destructive config merge), `skill update` / `remove`, polish — see [TYMIO_BOOTSTRAP.md](TYMIO_BOOTSTRAP.md) | **Done** in **@tymio/mcp-server@2.4.0** ([CHANGELOG](../mcp/CHANGELOG.md)) — **`tymio-mcp bootstrap`** (Cursor / Claude / OpenCode / Codex), **`skill update`** / **`skill remove`**. |

## Naming note

- **“Phase 2 = CLI”** in conversation often meant *the next batch of CLI work*. Strictly: **Phase 2 = hub deploy**, **Phase 3 = npm publish** (current package version), **Phase 5 = remaining bootstrap CLI** (preview pieces already in **2.2.0**). Use the table above to avoid drift.

## What to do next (default order)

1. **Confirm Phase 2:** Deploy production hub + smoke test (**`tymio_*`**, **`/skills/*`**, **`/.well-known/opencode`**).
2. **Ontology (optional):** **`npm run ontology:refresh --workspace server`** so capability bindings include **`tymio_list_skills`** / **`tymio_install_skill`** if desired.
3. **Phase 5:** Shipped in **2.4.0** — verify in production docs and hub initiative notes if desired.

## Related docs

- [TYMIO_MCP_RENAME.md](TYMIO_MCP_RENAME.md) — rename spec (implemented).
- [TYMIO_BOOTSTRAP.md](TYMIO_BOOTSTRAP.md) — full agent-onboarding spec (partially implemented over time).
- [TYMIO_MCP_CLI_AGENT_GUIDANCE.md](TYMIO_MCP_CLI_AGENT_GUIDANCE.md) — canonical agent copy (mirrors `mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md`).

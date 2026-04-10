# Tymio hub agents: PM, PO, and DEV

This document compares **which hub functions and data** each autonomous agent role should rely on, and points to **draft Cursor skills** (one per role).

| Skill (load in Cursor) | Path |
|------------------------|------|
| Product Manager | [.cursor/skills/tymio-pm-agent/SKILL.md](../.cursor/skills/tymio-pm-agent/SKILL.md) |
| Product Owner | [.cursor/skills/tymio-po-agent/SKILL.md](../.cursor/skills/tymio-po-agent/SKILL.md) |
| Developer | [.cursor/skills/tymio-dev-agent/SKILL.md](../.cursor/skills/tymio-dev-agent/SKILL.md) |

Shared hub vocabulary and connection rules: [.cursor/skills/tymio-workspace/SKILL.md](../.cursor/skills/tymio-workspace/SKILL.md) and [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md).

**Ontology (all PM/PO/DEV skills):** Agents should internalize the **backlog work graph** and how it differs from the **capability** brief — see [.cursor/skills/tymio-workspace/references/tymio-hub-ontology.md](../.cursor/skills/tymio-workspace/references/tymio-hub-ontology.md) (Mermaid diagrams, `drd_*` implications).

**Legend:** **P** = primary (use often), **S** = secondary (use when relevant), **—** = usually out of scope (do not default to these calls).

---

## 1. MCP / REST capability matrix

| Function / data area | Typical MCP tools / REST | PM | PO | DEV |
|----------------------|--------------------------|----|----|-----|
| Hub health | `drd_health` | S | S | S |
| IDs and taxonomy (domains, products, users) | `drd_meta`, `drd_list_domains`, `drd_list_products` | P | P | P |
| Product tree / structure | `drd_get_product_tree` | P | P | S |
| Agent capability brief (what the hub exposes) | `tymio_get_agent_brief`, ontology `GET /brief` | P | P | P |
| Workspace atlas (compiled backlog JSON; full MCP only) | `tymio_get_workspace_atlas`, `tymio_search_workspace_objects`, `tymio_get_workspace_object`, `tymio_explain_workspace_object`; rebuild `tymio_rebuild_workspace_atlas` | P | P | S |
| Coding agent guide (implementation context) | `tymio_get_coding_agent_guide`, `GET /api/agent/coding-guide` | S | S | P |
| Capabilities map | `tymio_list_capabilities`, `tymio_get_capability` | S | S | P |
| Initiatives (list, detail, create, update, delete) | `drd_list_initiatives`, `drd_get_initiative`, `drd_create_*`, `drd_update_*`, `drd_delete_*` | P | P | S |
| Features | `drd_list_features`, `drd_create_feature`, `drd_update_feature` | S | P | P |
| Requirements / acceptance | `drd_list_requirements`, `drd_create_requirement`, `drd_update_requirement`, `drd_upsert_requirement` | S | P | P |
| Demands / input signals | `drd_list_demands` | P | S | — |
| Accounts / partners (B2B context) | `drd_list_accounts`, `drd_list_partners` | P | S | — |
| KPIs / milestones | `drd_list_kpis`, `drd_list_milestones` | P | S | — |
| Revenue streams | `drd_list_revenue_streams` | P | — | — |
| Personas | `drd_list_personas` | P | S | — |
| Decisions | `drd_list_decisions` | P | P | S |
| Risks | `drd_list_risks` | P | P | S |
| Dependencies | `drd_list_dependencies` | S | P | P |
| Assignments / ownership | `drd_list_assignments` | S | P | P |
| Stakeholders | `drd_list_stakeholders` | P | S | — |
| Timeline (calendar / Gantt) | `drd_timeline_calendar`, `drd_timeline_gantt` | P | P | S |
| Campaigns / assets | campaign/asset tools when enabled | P | — | — |
| Product CRUD | `drd_create_product`, `drd_update_product` | S (with care) | S | — |

Tool names may evolve; always confirm with `tymio_get_agent_brief` or `drd_meta` on the live hub.

---

## 2. Data focus by role (short)

| Role | Primary questions the agent answers | Main entities |
|------|-------------------------------------|---------------|
| **PM** | What bets are we making? Why? For whom? What are the risks, decisions, and signals? | Initiatives, domains/products, demands, KPIs/milestones, decisions, risks, stakeholders, timeline |
| **PO** | What is in/out of scope for this initiative? Who owns what? What are acceptance criteria and dependencies? | Initiatives, features, requirements, assignments, dependencies, decisions, risks, timeline |
| **DEV** | What exactly should I build? What constraints and dependencies apply? Where is technical guidance? | Requirements, features, initiatives (context), dependencies, coding guide / capabilities brief |

---

## 3. Permissions reminder

Respect tenant RBAC (lowest to highest): `VIEWER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`. PM/PO agents that **mutate** backlog need **EDITOR** (or higher) as appropriate; **DEV** agents may be read-heavy with occasional updates only if your process allows it.

---

## 4. Stdio / API-key subset

If the MCP client uses **`DRD_API_KEY` / `API_KEY`** (REST bridge), the **tool list is smaller** than remote OAuth MCP. For full PM/PO coverage of create/update/delete tools, prefer **remote `…/mcp` + OAuth** or **`tymio-mcp login`** without API key on the process — see [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md).

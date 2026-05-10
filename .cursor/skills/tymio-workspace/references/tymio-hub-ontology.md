# Tymio hub ontology — small graph for agents

Use this **before** listing or mutating hub data so you pick the right entity layer and MCP tools. There are **two** “ontology” ideas in Tymio; both matter.

---

## 1. Backlog ontology (work graph)

**What it is:** The **tenant’s work model** — domains, products, roadmap bets, delivery breakdown, and signals. These are **rows** in the hub (`tymio_*` list/get/create/update tools).

**Core spine (always walk in this direction when drilling down):**

```mermaid
flowchart LR
  Domain --> Initiative
  Product --> Initiative
  Initiative --> Feature
  Feature --> Requirement
```

| Entity | Role | Typical parent / anchor |
|--------|------|-------------------------|
| **Domain** | Strategic bucket / swimlane | Tenant taxonomy (`tymio_list_domains`) |
| **Product** | Product line or surface (optional on initiative) | Tenant taxonomy; `productId` nullable on **Initiative** |
| **Initiative** | Roadmap bet / epic | **Required** `domainId`; optional `productId` |
| **Feature** | Sized deliverable under one initiative | **Required** `initiativeId` |
| **Requirement** | Finest execution row; what devs implement | **Required** `featureId`; may map to execution board column |

**Signals and context (link into the spine):**

```mermaid
flowchart TB
  Demand --> DemandLink
  DemandLink --> Initiative
  DemandLink --> Feature
  Account --> Demand
  Partner --> Demand
```

| Entity | Role |
|--------|------|
| **Demand** | **Stakeholder / integration intake signal** — why work was requested; **DemandLink** attaches to an **Initiative** and/or **Feature**. **Not** the same entity as a backlog **Requirement** (delivery row). Demands are triaged into Features/Requirements. |
| **Account** | B2B customer context; **Demand** may reference an account |
| **Partner** | **Integration catalog** (SDLC): external system or party the product depends on (APIs, OAuth providers, email, etc.). The hub UI calls these **Integrations**; the DB model name remains **`Partner`**. **Not** authoritative infra config (zones, Terraform); use engineering sources of truth for that. **Demand** may reference a partner when the ask comes *via* that integration. |

### Integration catalog (`Partner` / “Integrations”)

- **Role:** Track **named external dependencies** and attach **integration-sourced requests** (`Demand` with `sourceType` partner/account/internal/compliance).
- **API/MCP:** `tymio_list_partners`, partner CRUD via REST under `/api/partners` (workspace-scoped).
- **Distinction:** **Demand** = upstream request/intake; **Requirement** = fine-grained delivery task under a **Feature**.

**Hung off Initiative (portfolio / PO view):**

- **Decision**, **Risk** — commitments and threats  
- **Stakeholder**, **InitiativeAssignment** — people and ownership  
- **InitiativeMilestone**, **InitiativeKPI** — time and outcome framing  
- **InitiativePersonaImpact** / **Persona** — who benefits  
- **InitiativeRevenueStream** / **RevenueStream** — revenue mix  
- **SuccessCriterion** — checklist-style success under the initiative  
- **Dependency** — **initiative → initiative** only (`fromInitiativeId` / `toInitiativeId`); not feature-level edges in this model  

**People on delivery rows:**

- **Initiative.owner**, **Feature.owner**, **Requirement.assignee** — use assignments and owner fields when explaining “who”.

**Design / external IDs (for agents reading descriptions):**

- Initiative: deep links often in **`notes`**; Feature: **`description`** + **`acceptanceCriteria`** for behavior; Requirement: **`externalRef`** for primary ticket/node id — see `docs/DESIGN_REFERENCES.md`.

---

## 2. Capability ontology (product affordances)

**What it is:** A **semantic map of what the hub can do** — named capabilities bound to routes, pages, MCP tools, and models. It is **not** a backlog row. The word **“Capability”** here ≠ **Feature** entity.

**How agents use it:**

- **`tymio_get_agent_brief`** or `GET /api/ontology/brief` — compiled brief aligned with live bindings  
- **`tymio_list_capabilities`** / **`tymio_get_capability`** — inspect a single affordance  
- Optional checked-in snapshot: `context/AGENT_BRIEF.md` (regenerate from hub; not hand-edited as source of truth)

Use the **capability ontology** to answer “what screens/APIs exist?” Use the **backlog ontology** to answer “what work exists and how is it decomposed?”

---

## 3. How smarter tool use follows the graph

1. **Resolve taxonomy first:** `tymio_meta` / `tymio_list_domains` / `tymio_list_products` so **Domain** and **Product** ids are real.  
2. **Narrow to one Initiative** before creating **Features** (every feature needs `initiativeId`).  
3. **Narrow to one Feature** before creating **Requirements** (every requirement needs `featureId`).  
4. **Dependencies between bets** are **Initiative ↔ Initiative**; do not invent cross-feature “dependency” rows if the hub only exposes initiative-level deps.  
5. **Demands** explain *why* something exists (intake); follow **DemandLink** to the initiative/feature. Do **not** confuse **Demand** with **Requirement** — requirements are what engineers ship under a feature.  
6. When the user asks about **“the ontology”** ambiguously, clarify: **work graph** (above) vs **capability brief** (`tymio_*`).

---

## 4. See also

- Base skill: [../SKILL.md](../SKILL.md)  
- MCP tool names and REST: [mcp-and-rest.md](mcp-and-rest.md)  
- Design fields by layer: [docs/DESIGN_REFERENCES.md](../../../../docs/DESIGN_REFERENCES.md)  
- Capability / admin semantics: [docs/CODING_AGENT_HANDOFF_TYMIO_APP.md](../../../../docs/CODING_AGENT_HANDOFF_TYMIO_APP.md) (ontology section)

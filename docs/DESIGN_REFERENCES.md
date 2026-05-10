# Design references (Figma, etc.) in Tymio

How tenants store **design links and context** so they stay **durable, searchable, and consistent** with Tymio’s **initiative → feature → requirement** model and the optional **ontology** (capabilities + bindings).

---

## Tenant quick start (checklist)

1. **Everyday work** — Put links where people edit backlog items:
   - **Initiative:** `notes` (section / epic-level design).
   - **Feature:** `description` (primary frame + product wording); **`acceptanceCriteria`** only for testable behavior.
   - **Requirement:** **`externalRef`** for the single primary exact node or ticket id; extras in `description`.
2. **Capability-level anchor (optional)** — In **Admin → Ontology**, select a capability and add bindings:
   - **`FIGMA_NODE`** when the whole capability maps to one Figma file + node (see key format below).
   - **`DESIGN_REF`** for any other stable design URL or agreed id.
3. **Agents and briefs** — After changing ontology bindings, an admin should **Refresh default bindings** (if you use shipped defaults) and **Compile & store briefs** so `tymio_get_agent_brief` / `GET /api/ontology/brief` stay current.

---

## 1. Hybrid model: backlog fields (always available)

| Layer | Ontology role | Best field for design links | Why |
|--------|----------------|----------------------------|-----|
| **Initiative** | Strategic / epic-level capability | **`notes`** | Keep **`description`** stable and product-facing; `notes` fits internal references (Figma sections, design status). |
| **Feature** | Deliverable under an initiative | **`description`** | Humans need design context here; keep **`acceptanceCriteria`** for **testable / behavioral** criteria, not link dumps. |
| **Requirement** | Finest implementation-facing work | **`externalRef`** (primary exact node) | Single canonical link per row; optional extra states in **`description`**. |

**Rule of thumb: one primary design link per backlog item.**

| Level | Primary link |
|-------|----------------|
| Initiative | One **section** (or root frame) link |
| Feature | One **exact feature / frame** link |
| Requirement | One **exact UI state / node** in `externalRef` |

If more links are needed: keep the **main** one in the primary field; add **Related:** lines in `notes` (initiative), body of `description` (feature), or `description` (requirement).

### Structured design links on backlog rows (`DesignArtifactLink`)

In addition to text fields above, the hub supports **`DesignArtifactLink`** rows on **Feature** and **Requirement** with `provider` (`FIGMA`, `GENERIC_URL`, `CLAUDE_DESIGN`), `url`, and optional `nodeRef` (e.g. Figma `fileKey:nodeId`). Use these when you want **multiple** durable anchors or clearer separation from narrative text; capability-level **`FIGMA_NODE` / `DESIGN_REF`** ontology bindings remain the right place for **named hub capabilities** and compiled briefs. **Tier 2 (Figma OAuth)** can validate nodes and optionally sync status later; until then, pasted URLs behave like generic links with a typed provider.

---

## 2. Optional ontology bindings: `FIGMA_NODE` and `DESIGN_REF`

Bindings belong to a **capability** (Admin → Ontology), not to a single initiative row. They are **optional**: use them when you want the **compiled agent brief** and tooling to see the same design anchor you use in conversations about a **named hub capability** (e.g. “Product explorer”, “Campaign editor”).

| Type | When to use it | **Key** format (examples) |
|------|----------------|---------------------------|
| **`FIGMA_NODE`** | Figma is source of truth for that capability’s main frame or spec page | **`fileKey:nodeId`** in Figma’s internal colon form. From a share URL `…?node-id=12-34` → use **`12:34`** (replace the hyphen with a colon). Full key: **`AbCdEfGhIj:12:34`** where **`AbCdEfGhIj`** is the file key from `figma.com/design/<fileKey>/…`. |
| **`DESIGN_REF`** | Penpot, FigJam, Confluence, Notion, PDF link, or internal id | Full **`https://…`** URL, or a short stable id your team documents (e.g. **`DESIGN-2025-ONBOARDING`**). |

**Notes field (binding):** Use optional **binding notes** in the Ontology UI for human context (“Main mobile frame”, “Deprecated — use v2 file”), not for secrets.

**Refresh behavior:** **Refresh default bindings** only updates **generated** bindings from the codebase manifest. **Custom** `FIGMA_NODE` / `DESIGN_REF` rows you add by hand are **not** removed by refresh; they stay on the capability until you delete them.

---

## 3. When to use backlog fields vs ontology design bindings

| Situation | Use |
|-----------|-----|
| Link tied to **one epic / story / task** | Backlog fields (`notes`, `description`, `externalRef`) |
| Link describes **the whole capability** (“everything under Product explorer”) and should appear next to **routes and MCP tools** in the brief | Add **`FIGMA_NODE`** or **`DESIGN_REF`** on that **capability** |
| You only paste URLs in initiative notes | That is enough; ontology bindings are optional |
| Design moved in Figma | Update the **key** or URL everywhere you stored it (backlog + capability bindings) |

Ontology bindings still complement (not replace) **`ROUTE`**, **`MCP_TOOL`**, **`PRISMA_MODEL`**, etc.: they tell agents **where the product is implemented** and **where the design lives**.

---

## 4. Ontology-heavy features (templates, assistants, …)

For work strongly tied to product semantics:

- Name themes in **`feature.description`** (and initiative `notes` if epic-wide), not only pasted URLs — templates, scene builder, assistant flows, notifications, structured generation, etc.
- Add **`DESIGN_REF`** or **`FIGMA_NODE`** on the matching **capability** if you want that anchor in the **compiled brief** alongside tools and routes.

---

## 5. Where this appears in the app

- **Initiative:** `notes` includes an in-product hint (i18n).
- **Feature:** feature detail supports **description** and **acceptance criteria** editing, with hints.
- **Requirement:** **External reference** for the primary link; description for extras; hints in UI.
- **Admin → Ontology:** Expand **“How design bindings work”** under **Bindings** for a short in-app summary; this file is the full playbook.

Canonical **agent / API** context: [CODING_AGENT_HANDOFF_TYMIO_APP.md](./CODING_AGENT_HANDOFF_TYMIO_APP.md) §5 (ontology).

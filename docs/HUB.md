# Tymio — multi-tenant product and project management hub

**Canonical product domain:** [tymio.app](https://tymio.app)

**Repository role:** This monorepo implements **Tymio** — a web application where **tenants** (organizations) run product and project management in one place: roadmaps, initiatives, prioritization, delivery tracking, B2B context (accounts, partners, demands), marketing artifacts (campaigns, assets), and agent access via MCP.

Sample data and labels in the codebase may still reflect a particular industry; treat that as **demo tenant content**, not the definition of the platform.

---

## 1. Product scope

### 1.1 What teams use it for

- **Product management:** Initiatives and features, priorities (P0–P3), horizons, domains/pillars, product lines, personas, revenue attribution, RACI, decisions, risks, dependencies, milestones, KPIs, stakeholders.
- **Project delivery:** Requirements under features, statuses, assignments, timelines (calendar, Gantt), boards (domain, priority, accountability, status).
- **Go-to-market context (optional modules):** Accounts, partners, demands linked to work items; campaigns and assets linked to initiatives and accounts.
- **Automation:** Same capabilities exposed to AI agents through **MCP** (Model Context Protocol) with the same permissions as interactive users.

**Design references (Figma, etc.):** Where to put links in the backlog, and when to add optional ontology binding types **`FIGMA_NODE`** / **`DESIGN_REF`** on a capability, is documented in [DESIGN_REFERENCES.md](./DESIGN_REFERENCES.md) (tenant checklist + key formats).

### 1.2 Multi-tenancy — target vs today

| Aspect | Target (Tymio) | Today (this codebase) |
|--------|----------------|------------------------|
| Data isolation | Each **tenant** has a dedicated slice of data; APIs and UI enforce boundaries. | One **logical dataset** per deployment; no `organizationId` on rows. |
| Users | Same person may belong to multiple tenants with per-tenant roles. | Global `User` and global `role`. |
| Branding | Tymio shell; tenant-specific naming where product requires it. | Single-app branding; demo copy may reference legacy names. |

**Implication:** For true multi-tenant SaaS, the stack needs an organization model, tenant-scoped queries, and MCP tokens scoped to a tenant. Until then, you can still run **one deployment per customer** as a practical isolation pattern.

**Technical source of truth for entities:** `server/prisma/schema.prisma`.

**Terminology:** In the database, the `Product` model means a **product line / pillar** used to group initiatives — not a SaaS tenant. The word **tenant** means the **customer organization** using Tymio.

---

## 2. Architecture (summary)

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, TypeScript, Tailwind, React Router, i18next |
| Backend | Express, TypeScript, Prisma, PostgreSQL |
| Auth | Google OAuth (Passport), cookie sessions (PostgreSQL session store) |
| Agents | MCP Streamable HTTP on the same Express app (`/mcp`) + optional stdio server in `mcp/` |

**Layout:** Workspace packages — `client/` (SPA), `server/` (API + static `client/dist` in production), `mcp/` (local MCP over REST + API key).

**Deploy:** Typical setup is a **single Node service** (e.g. Railway) with attached PostgreSQL; Docker and `docker-compose` are supported for local DB.

---

## 3. Authentication and roles

- **Production:** Google OAuth; callback path `/api/auth/google/callback` (full URL in `GOOGLE_CALLBACK_URL`).
- **Roles:** `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `MARKETING`, `VIEWER`, `PENDING` — see server middleware and `usePermissions` on the client.
- **Development:** Optional dev login when `ALLOW_DEV_AUTH=true` (blocked in production); client shows dev buttons when `VITE_ENABLE_DEV_LOGIN=true`.
- **Automation:** Optional `API_KEY` on the server; `Authorization: Bearer <API_KEY>` impersonates a configured user (used by the stdio MCP package and scripts).

Environment template: `server/.env.example`.

---

## 4. Local development

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
# Set DATABASE_URL, SESSION_SECRET, and Google vars (or ALLOW_DEV_AUTH=true for local only)
npm run db:generate
npm run db:migrate --workspace server -- --name init   # or your migration name
npm run db:seed   # optional demo data; do not use full seed in production
npm run dev
```

Client dev server proxies `/api` to the backend when `VITE_API_BASE_URL` is empty.

---

## 5. Production deployment

1. Provision PostgreSQL and set `DATABASE_URL`, `SESSION_SECRET`, `CLIENT_URL` (public origin, no trailing slash), and Google OAuth variables.
2. Set **`GOOGLE_CALLBACK_URL`** to `https://<host>/api/auth/google/callback`.
3. In **Google Cloud Console** (OAuth web client):  
   - **Authorized JavaScript origins:** `https://<host>`  
   - **Authorized redirect URIs:**  
     - `https://<host>/api/auth/google/callback`  
     - `https://<host>/mcp-oauth/google/callback` (required for remote MCP)
4. Run migrations (e.g. Railway `preDeployCommand` / `prisma migrate deploy`).
5. **Do not** run full `db:seed` in production (it replaces data).

### 5.1 Notifications (optional)

After notification-related migrations exist, you may run once:

```bash
npm run db:seed-notification-rules
```

This only replaces default **initiative** notification rules; it is idempotent and optional. The app runs without it.

---

## 6. MCP — agents and tools

Two connection modes:

| Mode | URL / transport | Auth |
|------|-----------------|------|
| **Remote** | `POST https://<host>/mcp` (Streamable HTTP) | OAuth 2.1 with Google; per-user identity |
| **Local** | stdio via `mcp/` package | `API_KEY` on server + `DRD_API_KEY` in MCP env |

**Remote flow (high level):** Unauthenticated `POST /mcp` returns `401` with OAuth metadata; client discovers `/.well-known/oauth-protected-resource/mcp`, registers, sends the user through Google, callback at `/mcp-oauth/google/callback`, then uses JWT `Bearer` tokens on `/mcp`.

**Important env:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLIENT_URL`, optional `MCP_JWT_SECRET` (defaults to `SESSION_SECRET`).

**Cursor example** (local + deployed):

```json
{
  "mcpServers": {
    "tymio-local": { "url": "http://localhost:8080/mcp" },
    "tymio": { "url": "https://<your-host>/mcp" }
  }
}
```

Tool names currently use the historical prefix `drd_` (e.g. `drd_list_initiatives`); renaming is a backward-compatibility decision for clients.

**Implementation:** `server/src/mcp/setup.ts`, `oauth-provider.ts`, `tools.ts`; local package: `mcp/README.md`.

### 6.1 Capability ontology and agent brief

The hub stores **product capabilities** (user-language semantics) and **bindings** to routes, MCP tools, and Prisma models. A **compiler** produces Markdown and JSON briefs for agents.

- **REST:** `GET /api/ontology/capabilities`, `GET /api/ontology/brief?format=md|json&mode=compact|full`, admin-only `POST /api/ontology/compile`, `POST /api/ontology/refresh-bindings`, `POST /api/ontology/export-file`.
- **MCP:** `tymio_get_coding_agent_guide` (full playbook Markdown), `tymio_get_agent_brief`, `tymio_list_capabilities`, `tymio_get_capability` (same auth as other tools).
- **REST:** `GET /api/agent/coding-guide` (authenticated) returns the same playbook as `text/markdown`.
- **Admin UI:** Admin → **Ontology** tab.
- **Repo export:** default path `context/AGENT_BRIEF.md` (see `context/README.md`).
- **CLI:** `npm run ontology:refresh --workspace server` (requires `DATABASE_URL`).

---

## 7. Security (baseline)

- Use **helmet**, **rate limiting**, and **Zod** validation on inputs where implemented.
- **API key** comparison must be timing-safe (see server `apiKeyAuth`).
- **Dev auth** must remain disabled in production (`NODE_ENV === "production"` guard).
- Enforce **authorization on every mutating route** (roles + resource checks); do not rely on the UI alone.

Run `npm audit` and your SAST pipeline regularly.

---

## 8. Where to change things

| Goal | Location |
|------|----------|
| Schema / entities | `server/prisma/schema.prisma` |
| OAuth / session | `server/src/auth/passport.ts`, `server/src/routes/auth.ts` |
| REST API | `server/src/routes/` |
| MCP tools | `server/src/mcp/tools.ts` |
| Ontology / brief compiler | `server/src/routes/ontology.ts`, `server/src/services/ontologyBrief.ts`, `server/src/services/ontologyRefresh.ts` |
| Permissions (client) | `client/src/hooks/usePermissions.ts` |
| i18n | `client/src/i18n/` |

---

## 9. Documentation in this repo

This file is the **single product and engineering overview**. There is no separate archive: older documents were removed in favor of this consolidation.

**Coding agents / automation:** see **[docs/CODING_AGENT_TYMIO.md](./CODING_AGENT_TYMIO.md)** for end-to-end use (MCP, REST, ontology brief, “as-is → Tymio”, feature lifecycle).

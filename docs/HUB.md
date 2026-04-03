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

### 1.2 Multi-tenancy (as implemented)

Tymio is a **multi-workspace** app: each **tenant** is a customer organization. Business data is stored in the **shared PostgreSQL schema** with a nullable **`tenantId`** on tenant-scoped models (see `server/prisma/schema.prisma`). **Per-tenant Postgres schemas** exist on the `Tenant` model (`schemaName`) for provisioning/migration plumbing; routine API access uses **row-level** `tenantId`, not separate DB schemas per request.

| Aspect | Behavior in this codebase |
|--------|---------------------------|
| **Data isolation** | When a request has **active tenant context**, Prisma queries on listed models are **automatically filtered** (and creates get `tenantId` injected) via a **client extension** in `server/src/tenant/tenantPrisma.ts` (`TENANT_SCOPED_MODELS`). **User** is global (no `tenantId`); `User.findMany` in meta and similar are not auto-scoped. |
| **When context applies** | `tenantResolver` (`server/src/tenant/tenantResolver.ts`) runs after auth. It resolves tenant from, in order: **`X-Tenant-Id` header**, **`session.activeTenantId`**, **`user.activeTenantId`**, validates **membership** and **ACTIVE** status, then runs the rest of the request inside **`runWithTenant`** (AsyncLocalStorage). If resolution fails, the request continues **without** tenant context → extension does **not** inject `tenantId` (legacy / migration / misconfiguration: queries may see **all rows**). |
| **Users & roles** | **`User.role`** is a **platform** role (`SUPER_ADMIN`, `ADMIN`, …). **`TenantMembership`** gives **per-tenant** roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`). **`user.activeTenantId`** is the default workspace; **`POST /api/me/tenants/switch`** updates DB + session. |
| **Provisioning** | **`GET/POST /api/tenants`** (and related) are **`SUPER_ADMIN`** only (`server/src/routes/tenants.ts`). **`POST /api/tenant-requests`** is the public/self-serve request flow (`server/src/routes/tenant-requests.ts`). |
| **Client** | **`TenantSwitcher` / `TenantPicker`** (`client/src/components/tenant/`). Slug login: **`/t/:slug`**, Google OAuth with **`?tenantSlug=`**, public **`GET /api/tenants/by-slug/:slug/public`**. |
| **MCP** | **`/mcp`** uses **Bearer OAuth JWT** on the route; it does **not** go through the same path as session cookie auth for **`req.user`**. **`tenantResolver` therefore usually does not set tenant context for remote MCP**, and MCP tool handlers use **`prisma` without** that AsyncLocalStorage context today → **tenant filtering is not enforced for remote MCP** until explicitly wired (e.g. resolve user from JWT, then `runWithTenant`). **API key** sessions that set **`req.user`** *do* pass through **`tenantResolver`** and get scoping if **`activeTenantId`** is set. |
| **Optional middleware** | **`requireTenant`** (`server/src/tenant/requireTenant.ts`) returns **400** if `req.tenantContext` is missing; use on routes that must not run without a workspace. Most REST routers rely on the extension + resolver instead of calling **`requireTenant`** globally. |

**Migrating an existing single-tenant database:** idempotent script **`server/scripts/migrate-to-multitenancy.ts`** (run with `npx tsx`, see file header): creates/finds a tenant, memberships, backfills **`tenantId`**, sets **`activeTenantId`**.

**Technical source of truth for entities:** `server/prisma/schema.prisma`.

**Terminology:** The **`Product`** model is a **product line / pillar** (grouping initiatives) — not a SaaS tenant. **Tenant** = the **customer organization** (workspace).

---

## 2. Architecture (summary)

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, TypeScript, Tailwind, React Router, i18next — **UI locales:** `en`, `cs`, `sk`, `uk`, `pl` (workspace admins may restrict the in-app picker via `Tenant.settings.enabledLocales`; guests choose language on public pages). SEO/agent metadata: `client/index.html` (meta, Open Graph, JSON-LD), `client/public/llms.txt`, `GET /api/mcp/agent-context` → `supportedUiLocales`. |
| Backend | Express, TypeScript, Prisma, PostgreSQL |
| Auth | Google + Microsoft OAuth (Passport), optional email magic link (Resend), cookie sessions (PostgreSQL session store) — [IDENTITY_AUTH_STRATEGY.md](./IDENTITY_AUTH_STRATEGY.md) |
| Agents | MCP Streamable HTTP on the same Express app (`/mcp`) + optional stdio server in `mcp/` |

**Layout:** Workspace packages — `client/` (SPA), `server/` (API + static `client/dist` in production), `mcp/` (local MCP over API key).

**Two browser URLs (do not confuse):**

| URL | App | Who |
|-----|-----|-----|
| **`/admin`** | Main `client/` SPA — Users & Activity, settings, import/export, ontology, etc. | Platform **`ADMIN`** or **`SUPER_ADMIN`** (see `usePermissions`) |
| **`/platform/`** | Separate `admin/` SPA — registration requests, tenant provisioning, memberships | **`SUPER_ADMIN`** only |

Workspace **sign-in links** for sharing use **`{origin}/t/{tenantSlug}`** (see main app tenant switcher copy control and platform console).

The REST prefix **`/api/admin`** is the JSON API for workspace admin features; it is not a page route.

**Deploy:** Typical setup is a **single Node service** (e.g. Railway) with attached PostgreSQL; Docker and `docker-compose` are supported for local DB.

---

## 3. Authentication and roles

- **Strategy & roadmap (P0 email + Microsoft, matrix, passkeys):** [IDENTITY_AUTH_STRATEGY.md](./IDENTITY_AUTH_STRATEGY.md).
- **Production:** Google OAuth (`/api/auth/google/callback`), Microsoft OAuth (`/api/auth/microsoft/callback`), optional email magic link (`POST /api/auth/email/request`, `GET /api/auth/email/verify`). Callback URLs in env (`GOOGLE_CALLBACK_URL`, `MICROSOFT_CALLBACK_URL`). Optional **`tenantSlug`** on **`/api/auth/google`** or **`/api/auth/microsoft`** is stored in session and, after login, switches the user into that tenant if they are a member, then redirects to **`/t/<slug>`** (see `server/src/routes/auth.ts`). Magic-link verify does not carry `tenantSlug` yet (user lands on `/`).
- **Platform roles:** `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `MARKETING`, `VIEWER`, `PENDING` on **`User`** — see server middleware and `usePermissions` on the client.
- **Workspace roles:** `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` on **`TenantMembership`** — used for tenant-scoped admin operations where enforced.
- **Active workspace:** `GET /api/auth/me` returns **`activeTenant`** from **`user.activeTenantId`** (and resolver may override with header/session). **`GET /api/me/tenants`** lists memberships; **`POST /api/me/tenants/switch`** sets **`activeTenantId`** and **`session.activeTenantId`**.
- **Development:** Optional dev login when `ALLOW_DEV_AUTH=true` (blocked in production); client can pass **`tenantId`** / **`tenantSlug`** in the dev-login body; list tenants via **`GET /api/auth/dev-tenants`**.
- **Automation:** Optional `API_KEY` on the server; `Authorization: Bearer <API_KEY>` impersonates a configured user (used by the stdio MCP package and scripts). With **`tenantResolver`**, that user’s **`activeTenantId`** scopes Prisma when set.

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

### 5.1 Existing DB without tenants

If you upgraded from an older deployment and need workspaces + **`tenantId`** backfill, run the idempotent script documented in **`server/scripts/migrate-to-multitenancy.ts`** (typically `npx tsx server/scripts/migrate-to-multitenancy.ts` with optional `--slug` / `--name`). Then ensure users have **`activeTenantId`** and **`TenantMembership`** so **`tenantResolver`** scopes API traffic.

### 5.2 Notifications (optional)

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

**Tenant note:** Remote MCP (**OAuth Bearer** on `/mcp`) does not currently establish **`runWithTenant`**; treat tool data as **not tenant-scoped** until the server attaches tenant context from the authenticated MCP user. Prefer **API key + `activeTenantId`** for scripted access when isolation matters.

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
| Tenant resolution & Prisma scoping | `server/src/tenant/tenantResolver.ts`, `server/src/tenant/tenantContext.ts`, `server/src/tenant/tenantPrisma.ts`, `server/src/tenant/requireTenant.ts` |
| Tenant admin & provisioning | `server/src/routes/tenants.ts`, `server/src/routes/tenant-requests.ts`, `server/src/tenant/tenantProvisioning.ts` |
| OAuth / session | `server/src/auth/passport.ts`, `server/src/routes/auth.ts` |
| REST API | `server/src/routes/` |
| MCP tools | `server/src/mcp/tools.ts` |
| Workspace UI (switcher) | `client/src/components/tenant/` |
| Ontology / brief compiler | `server/src/routes/ontology.ts`, `server/src/services/ontologyBrief.ts`, `server/src/services/ontologyRefresh.ts` |
| Permissions (client) | `client/src/hooks/usePermissions.ts` |
| i18n | `client/src/i18n/` |

---

## 9. Documentation in this repo

This file is the **single product and engineering overview**. There is no separate archive: older documents were removed in favor of this consolidation.

**Coding agents / automation:** see **[docs/CODING_AGENT_TYMIO.md](./CODING_AGENT_TYMIO.md)** for end-to-end use (MCP, REST, ontology brief, “as-is → Tymio”, feature lifecycle).

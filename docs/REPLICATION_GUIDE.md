# Replication Guide: Product Board for Another Company

This document describes **what is implemented** in this project and **how it works**, so you can replicate the same solution pattern for another company. The current instance is a **persona-driven product backlog** for Doctor Digital with a B2B2C lens; the **architecture, patterns, and feature set** are reusable—you adapt the domain model, branding, and optional modules (e.g. B2B vs B2C) as needed.

---

## 1. High-Level Solution Pattern

| Aspect | This project (DrD Hub) | For another company |
|--------|------------------------|----------------------|
| **Product type** | Internal product board / backlog manager | Same pattern: backlog + prioritization + views |
| **Users** | Internal team (Google SSO, roles, pending approval) | Same: internal users; change auth domains or add other IdPs |
| **Core entity** | **Initiative** (backlog item with priority, horizon, status, owner, domain) | Keep or rename (e.g. Epic, Initiative, Project) |
| **Reference data** | Products, Domains, Personas, Revenue Streams, Accounts, Partners | Reuse or subset; add/remove (e.g. no Partners, add Regions) |
| **Optional modules** | B2B (Accounts, Partners, Demands), Marketing (Campaigns, Assets), RACI, KPIs, Milestones, Stakeholders | Enable only what the new company needs; same code structure |
| **AI/agents** | MCP (remote OAuth + local API key) exposing same APIs | Same: expose REST as MCP tools; rename prefix if desired |

**Takeaway:** The app is a **monorepo** (client + server + optional MCP package) with **REST API + session/API-key auth + role-based permissions**, plus **MCP exposure** for AI agents. Replication = same stack + schema/domain tweaks + branding/config.

---

## 2. Tech Stack (Keep for Replication)

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 7, TypeScript, Tailwind 4, React Router 7 |
| **i18n** | i18next (en, cs, sk in this project; add/locales as needed) |
| **Charts / UX** | recharts, @dnd-kit (drag-and-drop), gantt-task-react, lucide-react |
| **Backend** | Express, TypeScript, Prisma, PostgreSQL |
| **Auth** | passport, passport-google-oauth20, express-session, connect-pg-simple (session in DB) |
| **Optional API auth** | Bearer API key (for MCP stdio / scripts) |
| **MCP** | @modelcontextprotocol/sdk (Streamable HTTP in Express + stdio in `mcp/` package), jose (JWT for OAuth) |
| **Deploy** | Railway (single service + Postgres), or any Node host; Dockerfile + docker-compose for local |

---

## 3. Project Structure

```
/
├── client/                 # React SPA
│   ├── src/
│   │   ├── main.tsx        # Entry; BrowserRouter, i18n, StrictMode
│   │   ├── App.tsx         # Auth gate, layout, routes, initiative panel/create modal
│   │   ├── components/     # layout (AppShell, FiltersBar), initiatives, pages, ui
│   │   ├── hooks/          # useAuth, useBoardData, usePermissions
│   │   ├── lib/            # api.ts (all REST calls)
│   │   ├── pages/          # One per view (DomainBoard, PriorityGrid, Raci, etc.)
│   │   ├── types/          # models (Initiative, User, Meta, etc.)
│   │   └── i18n/           # en, cs, sk
│   ├── vite.config.ts      # Proxy /api -> backend in dev
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.ts        # Express: CORS, session, passport, apiKeyAuth, MCP mount, routes, static client in prod
│   │   ├── env.ts          # Zod env schema (DB, Google, API_KEY, etc.)
│   │   ├── db.ts           # Prisma client
│   │   ├── auth/           # passport.ts (Google strategy, roleForEmail, serialize/deserialize)
│   │   ├── middleware/     # auth.ts (requireAuth, requireRole, requireWriteAccess, requireMarketingAccess), apiKeyAuth.ts
│   │   ├── routes/         # One file per resource (auth, meta, initiatives, features, ...)
│   │   ├── services/       # audit.ts (log to AuditEntry)
│   │   ├── mcp/            # setup.ts (mount MCP), oauth-provider.ts, tools.ts
│   │   └── ...
│   ├── prisma/
│   │   ├── schema.prisma   # Single PostgreSQL datasource; all models and enums
│   │   └── migrations/
│   └── package.json
├── mcp/                    # Standalone MCP server (stdio), calls API with API key
│   ├── src/index.ts
│   └── package.json
├── docs/                   # Design wireframes (SVG), MCP docs, domain notes
├── package.json            # Workspaces: client, server, mcp
├── Dockerfile              # Multi-stage build; serves client/dist from Express
├── docker-compose.yml      # Postgres for local
└── railway.json            # Deploy config; preDeployCommand: migrate
```

---

## 4. What Is Implemented (Feature List)

### 4.1 Authentication

- **Google OAuth 2.0:** Sign-in, callback, session cookie (`dd.sid`), 14-day session.
- **User resolution:** First login by Google → create User or match by `googleId` / email / `UserEmail` alias; **role** from `roleForEmail(email)` or `PENDING`.
- **Pending users:** New users not in auto-role list get `PENDING`; app shows “pending approval” and blocks access until an admin sets a role.
- **Dev fallback:** `ALLOW_DEV_AUTH=true` + `POST /api/auth/dev-login` (body: role); optional `VITE_ENABLE_DEV_LOGIN` to show dev login buttons (dev only).
- **API key:** Optional `API_KEY`; `Authorization: Bearer <API_KEY>` authenticates as a user (`API_KEY_USER_ID` or first SUPER_ADMIN). Used by MCP stdio and any script.
- **Session store:** `connect-pg-simple` → PostgreSQL table `session`.

**Replication:** Replace `roleForEmail()` in `server/src/auth/passport.ts` with your company’s rules (e.g. config table or different email domains). Keep the same flow: Google → find/create user → assign role or PENDING.

### 4.2 Roles and Permissions

- **Roles (Prisma enum):** `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `MARKETING`, `VIEWER`, `PENDING`.
- **Permission matrix (client: `usePermissions`, server: middleware):**
  - **Structure (products, domains, accounts, partners, demands, assignments, admin, import/export):** ADMIN, SUPER_ADMIN.
  - **Content (initiatives, features, decisions, risks, milestones, KPIs, stakeholders, requirements):** EDITOR, ADMIN, SUPER_ADMIN.
  - **Marketing (campaigns, assets, campaign-links):** MARKETING, ADMIN, SUPER_ADMIN.
  - **User management (admin UI):** ADMIN, SUPER_ADMIN.
  - **Create initiative / export:** Same as content/structure as above; VIEWER is read-only.

**Replication:** Same enum and pattern; rename roles or add new ones in schema and in `usePermissions` + server middleware.

### 4.3 REST API (Summary)

All under `/api/*`. Auth: session or API key. Then per-route: `requireAuth`, `requireRole`, `requireWriteAccess`, `requireMarketingAccess`.

| Area | Routes | Purpose |
|------|--------|---------|
| **Auth** | `auth.ts` | Google, callback, dev-login, me, logout |
| **Meta** | `meta.ts` | Single `GET /api/meta`: domains, personas, revenueStreams, users, products, accounts, partners (for filters and dropdowns) |
| **Initiatives** | `initiatives.ts` | CRUD, reorder, CSV export; query: domainId, ownerId, horizon, priority, isGap |
| **Features** | `featuresRouter` | Nested under initiative; CRUD |
| **Decisions, Risks, Dependencies** | `decisionsRouter`, `risksRouter`, `dependenciesRouter` | Per-initiative |
| **Requirements** | `requirementsRouter` | Per-feature |
| **Products, Domains, Personas, Revenue streams** | `productsRouter`, `domainsRouter`, etc. | Reference data CRUD |
| **Accounts, Partners, Demands** | `accountsRouter`, `partnersRouter`, `demandsRouter` | B2B reference + demands |
| **Demand links** | Part of demands/initiatives | Link demands to initiatives/features |
| **Assignments** | `assignmentsRouter` | RACI: initiative–user with role (ACCOUNTABLE, IMPLEMENTER, CONSULTED, INFORMED) |
| **Timeline** | `timelineRouter` | Timeline data for initiatives |
| **Campaigns, Assets, Campaign links** | `campaignsRouter`, `assetsRouter`, `campaignLinksRouter` | Marketing; link to initiatives/features/accounts/partners |
| **Milestones, KPIs, Stakeholders** | `milestonesRouter`, `kpisRouter`, `stakeholdersRouter` | Per-initiative |
| **Admin** | `admin.ts` | Users CRUD, email aliases, audit log, role promotion rules |
| **Import/Export** | `import-export.ts` | Full JSON export/import (versioned); SUPER_ADMIN/ADMIN only |

**Replication:** Keep route layout; add/remove resource routers and Prisma models to match the new domain (e.g. drop campaigns, add “Regions”).

### 4.4 Data Model (Prisma) – Core Concepts

- **User:** id, email, name, avatarUrl, role, isActive, lastLoginAt, googleId; relations: initiatives (owner), features, risks, assignments, accounts, partners, demands, campaigns, milestones, auditEntries; **UserEmail** for aliases.
- **Product, Domain, Persona (BUYER/USER/NONE), RevenueStream:** Reference data used to group and filter initiatives.
- **Initiative:** Central entity. Fields: title, description, priority (P0–P3), horizon (NOW/NEXT/LATER), status (IDEA/PLANNED/IN_PROGRESS/DONE/BLOCKED), productId, domainId, ownerId, commercialType, dealStage, strategicTier, arrImpact, dates, isGap, sortOrder; relations: features, decisions, risks, dependencies, demandLinks, campaignLinks, assignments, milestones, kpis, stakeholders, personaImpacts, revenueWeights.
- **Feature:** Belongs to initiative; has requirements; can link to demands/campaigns.
- **Account, Partner, Demand, DemandLink:** B2B/partner side; demands link to initiatives/features.
- **Campaign, Asset, CampaignLink:** Marketing; links to initiatives, features, accounts, partners.
- **InitiativeAssignment:** RACI per initiative.
- **InitiativeMilestone, InitiativeKPI, Stakeholder:** Per-initiative planning/tracking.
- **AuditEntry:** user, action, entityType, entityId, details.

**Replication:** Copy `schema.prisma` and trim or extend: remove B2B (Account, Partner, Demand) or marketing (Campaign, Asset) if not needed; add enums/fields for the new business (e.g. Region, Channel). Run migrations from the new schema.

### 4.5 Client (UI) – Views and Flows

- **Auth:** Sign-in card (Google + optional dev buttons); “pending approval” screen when `user.role === 'PENDING'`.
- **Main layout:** `AppShell` (nav, user menu, export, logout), `FiltersBar` (domain, owner, priority, horizon, gap, quick search). Filters drive `useBoardData` (meta + initiatives).
- **Routes (React Router):**
  - `/` – Domain Board (drag-and-drop by domain, reorder)
  - `/priority` – Priority Grid
  - `/raci` – RACI Matrix (read-only or editable by permission)
  - `/status-kanban` – Status Kanban (move initiative status)
  - `/accountability` – People Kanban (reassign ACCOUNTABLE)
  - `/kpi-dashboard` – KPI Dashboard
  - `/heatmap` – Stakeholder Heatmap
  - `/buyer-user` – Buyer x User matrix
  - `/gaps` – Gaps view
  - `/product-explorer` – Product Explorer
  - `/accounts` – Accounts (B2B)
  - `/demands` – Demands
  - `/partners` – Partners
  - `/campaigns` – Campaigns
  - `/milestones` – Milestones timeline
  - `/calendar` – Calendar
  - `/gantt` – Gantt
  - `/admin` – User list, edit user, email aliases (guarded by `canManageUsers`)
- **Initiative:** Detail panel (slide-over) with tabs: features, decisions, risks, dependencies, milestones, KPIs, stakeholders, demand/campaign links. Create/edit via modal (`InitiativeForm`). Open from any view via `?initiative=<id>` or click.
- **State:** `useBoardData` fetches meta + initiatives (with filters), exposes refresh; optional client-side quick filter. `usePermissions(user)` drives create/edit/structure/marketing/admin.

**Replication:** Same routing and layout pattern; hide/remove routes and tabs that don’t apply (e.g. campaigns, accounts); rename labels and brand (logo, `app.brand`, i18n keys).

### 4.6 MCP (Model Context Protocol)

- **Remote (recommended for Cursor):** MCP server inside Express at `POST /mcp`. Streamable HTTP; OAuth 2.1 (Google). Same user/role as web app. Discovery: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`; flows: authorize, token, register, revoke; callback: `/mcp-oauth/google/callback`. Implemented in `server/src/mcp/oauth-provider.ts`, `server/src/mcp/setup.ts`, `server/src/mcp/tools.ts`.
- **Local (stdio):** `mcp/` package, stdio transport; calls REST API with `DRD_API_KEY`. Same tool set; auth = API key on server.
- **Tools (same for both):** `drd_health`, `drd_meta`, `drd_list_initiatives`, `drd_get_initiative`, `drd_create/update/delete_initiative`, `drd_list_domains/products/personas/accounts/partners/revenue_streams`, `drd_list_kpis`, `drd_list_milestones`, `drd_list_demands`. Prefix `drd_` is project-specific; change for new company if desired.

**Replication:** Keep MCP setup; in `tools.ts` and `mcp/` mirror only the API endpoints you keep. Add Google redirect URI for `/mcp-oauth/google/callback` in Google Console. No other third-party APIs required.

---

## 5. How Key Patterns Work

### 5.1 Auth Flow (Google)

1. User clicks “Sign in with Google” → `GET /api/auth/google`.
2. Passport redirects to Google; user signs in; Google redirects to `GOOGLE_CALLBACK_URL` (e.g. `/api/auth/google/callback`) with code.
3. Passport exchanges code, loads profile; `roleForEmail(profile.emails[0])` or PENDING; find or create User; link `googleId` if existing by email; save session; redirect to `CLIENT_URL`.
4. Client calls `GET /api/auth/me` → returns current user or 401.

**Replication:** Change only `roleForEmail()` (and optionally add more OAuth providers). Rest stays the same.

### 5.2 Initiative Payload Consistency

Server uses a shared **Prisma include** (e.g. `initiativeInclude` in `server/src/routes/serializers.ts`) so every initiative list/detail response has the same shape (features, assignments, milestones, etc.). Client types (`Initiative`, etc.) match that shape.

**Replication:** Keep one central include per “main entity”; when you add/remove relations in schema, update that include and client types.

### 5.3 Permissions (Client vs Server)

- **Client:** `usePermissions(user)` → booleans (canCreate, canEditStructure, canManageUsers, …). Used to show/hide create button, admin nav, and read-only vs editable views.
- **Server:** Every mutation route uses `requireAuth` then `requireRole` / `requireWriteAccess` / `requireMarketingAccess`. Never rely only on client flags.

**Replication:** Same pattern; align role enums and permission logic on both sides.

### 5.4 Board Data and Filters

- **useBoardData(ready):** When `ready` (user present), fetches `GET /api/meta` and `GET /api/initiatives?domainId=&ownerId=&horizon=&priority=&isGap=` from current filter state. Returns `{ meta, initiatives, loading, refresh, filters, setFilters, setInitiatives }`. Optional client-side `quick` text filter.
- **After mutations:** Call `board.refresh()` so list and detail stay in sync.

**Replication:** Same hook pattern; filters and query params can match your new reference data (e.g. add regionId).

---

## 6. Environment and Configuration

### 6.1 Server (see `server/.env.example`)

- **Required:** `DATABASE_URL`, `SESSION_SECRET`.
- **Google (required unless dev auth):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`.
- **App:** `CLIENT_URL` (e.g. `http://localhost:5173` dev, or production app URL).
- **Dev:** `ALLOW_DEV_AUTH`, `DEV_AUTH_EMAIL`, `DEV_AUTH_NAME`, `DEV_AUTH_ROLE`.
- **API key (optional):** `API_KEY`, `API_KEY_USER_ID`.
- **MCP OAuth:** `MCP_JWT_SECRET` (optional; falls back to `SESSION_SECRET`).

### 6.2 Client

- `VITE_API_BASE_URL`: empty in dev if using Vite proxy `/api` → backend.
- `VITE_ENABLE_DEV_LOGIN`: set to `true` to show dev login (dev only).

### 6.3 MCP stdio

- `DRD_API_BASE_URL`, `DRD_API_KEY` (same as server `API_KEY`).

### 6.4 Google Console

- Web callback: `https://<your-domain>/api/auth/google/callback`.
- MCP callback: `https://<your-domain>/mcp-oauth/google/callback` (same OAuth client).

---

## 7. What to Change for Another Company (Checklist)

| Item | Where | Action |
|------|--------|--------|
| **Branding** | README, client (logo, “Dr. Digital”, i18n `app.brand`) | Replace with new company name and assets. |
| **Auth domains / roles** | `server/src/auth/passport.ts` → `roleForEmail()` | New email domains or config/DB-driven roles. |
| **Enums** | `server/prisma/schema.prisma` | Keep or rename (e.g. AccountType: add/remove B2B2C, B2G2C; add Region, Channel). |
| **Reference data** | Prisma models + routes + client | Add/remove (e.g. drop Partners, add Regions); update meta API and FiltersBar. |
| **B2B / Marketing** | Accounts, Partners, Demands, Campaigns, Assets | Omit routes + UI + MCP tools if not needed. |
| **Views** | `client/src/App.tsx` routes + nav | Remove or add views; keep Domain Board + Priority + detail panel as core. |
| **i18n** | `client/src/i18n/` | Add locales; change keys/labels to match new product. |
| **MCP tool prefix** | `server/src/mcp/tools.ts`, `mcp/` | e.g. `drd_` → `acme_` if desired. |
| **Domain docs** | `docs/` | Replace CZ health / CIO / compliance docs with new company context. |

---

## 8. Deployment (Unchanged Pattern)

- **Local:** `docker compose up -d postgres` (or `npm run db:up`), `npm run db:migrate`, `npm run db:seed`, `npm run dev`.
- **Production (e.g. Railway):** One service, root as root directory; add Postgres; set env from `server/.env.example`; set `GOOGLE_CALLBACK_URL` and MCP callback URL; deploy; run migrations (and seed if needed). Dockerfile builds client + server and serves `client/dist` from Express. For notification matrix release see `docs/DEPLOYMENT_NOTIFICATION_MATRIX.md` (migration is additive; optional `db:seed-notification-rules`).

---

## 9. References in This Repo

- **Setup and deploy:** `README.md`
- **MCP (remote vs local, tools, Cursor config):** `docs/MCP_API_EXPOSURE.md`
- **MCP stdio package:** `mcp/README.md`
- **Wireframes:** `docs/designs/*.svg`
- **SVG rules:** `.cursor/rules/svg-validation.mdc`

Use this guide together with the codebase and the above docs to replicate the product board for another company; adjust domain model and branding, and enable only the modules (B2B, marketing, RACI, etc.) that the new context requires.

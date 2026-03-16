# Exposing DrD Hub APIs as MCP

## Goal

Expose the project's REST APIs as **Model Context Protocol (MCP)** tools so that AI agents (e.g. in Cursor, Claude Desktop, or custom clients) can call DrD Hub operations through a standard MCP interface. Agents can connect **locally** (stdio + API key) or **remotely** (Streamable HTTP + OAuth 2.1 with Google).

---

## Two ways to connect

| Mode | Transport | Auth | Use case |
|------|------------|------|----------|
| **Remote (recommended for Cursor)** | Streamable HTTP at `/mcp` | OAuth 2.1 (Google login) | Cursor and other clients; each user gets their own identity and role. |
| **Local / CI** | stdio (separate `mcp` package) | Bearer `API_KEY` | Scripts, CI, or when you prefer a single shared API key. |

The **remote** MCP is built into the Express server (same process, same deploy). The **local** MCP is the standalone `mcp/` package that talks to the API over HTTP with an API key.

---

## Remote MCP (Streamable HTTP + OAuth 2.1)

### Architecture

The MCP server runs **inside the Express app** at `POST /mcp`. Cursor (or any MCP client) connects via URL. On first request without a token, the server returns `401` with OAuth metadata; the client discovers endpoints, registers, and sends the user through Google login. After that, all tool calls run as that user (real `userId` and role from the DB).

```
┌─────────────┐     GET /authorize      ┌──────────────┐     Redirect      ┌─────────────┐
│  Cursor /   │ ──────────────────────► │  DrD Express │ ─────────────────► │  Google     │
│  MCP client │                          │  /mcp,       │                    │  OAuth      │
└─────────────┘                          │  /authorize, │ ◄───────────────── └─────────────┘
       │                                 │  /token,    │   Callback + code
       │  POST /mcp + Bearer JWT         │  /mcp-oauth/ │
       │  (after OAuth flow)             │  google/     │
       └────────────────────────────────►│  callback   │
                                         └──────┬──────┘
                                                │ Prisma + user from JWT
                                                ▼
                                         ┌──────────────┐
                                         │  Tools       │
                                         │  (server/    │
                                         │   mcp/tools) │
                                         └──────────────┘
```

### Endpoints (on the same Express server)

| Path | Purpose |
|------|--------|
| `GET/POST /mcp` | MCP Streamable HTTP endpoint; requires Bearer token (JWT from OAuth). |
| `GET /.well-known/oauth-authorization-server` | OAuth 2.0 Authorization Server Metadata (discovery). |
| `GET /.well-known/oauth-protected-resource/mcp` | Protected Resource Metadata for `/mcp`. |
| `GET /authorize` | Starts OAuth flow; redirects to Google. |
| `POST /token` | Exchanges authorization code (or refresh token) for JWT access token. |
| `POST /register` | Dynamic client registration (e.g. Cursor registers itself). |
| `POST /revoke` | Token revocation. |
| `GET /mcp-oauth/google/callback` | Google OAuth callback; exchanges Google code for our auth code, then redirects back to client. |

### Authentication flow (high level)

1. Client `POST /mcp` with no token → `401` + `WWW-Authenticate` with resource metadata URL.
2. Client fetches `/.well-known/oauth-protected-resource/mcp` and discovers authorization server.
3. Client registers via `POST /register` (DCR).
4. Client opens browser to `GET /authorize` (with PKCE). User is redirected to Google.
5. User signs in with Google; Google redirects to `/mcp-oauth/google/callback` with a code.
6. Our server exchanges that code for Google tokens, resolves or creates the user in the DB (same logic as web login), then redirects the client’s redirect_uri with **our** authorization code.
7. Client exchanges our code at `POST /token` and receives a JWT access token (and refresh token).
8. Client calls `POST /mcp` with `Authorization: Bearer <access_token>`. Tools run with that user’s `userId` and role.

### Server-side implementation

- **`server/src/mcp/oauth-provider.ts`** — OAuth server provider: client store (in-memory DCR), authorize (redirect to Google), exchange code (Google → user → our JWT), refresh, verify JWT, revoke. Uses `jose` for JWT and reuses user resolution from `server/src/auth/passport.ts`.
- **`server/src/mcp/tools.ts`** — All MCP tools; call Prisma directly with user from `authInfo.extra.userId` / `authInfo.extra.role`. Enforces same role rules as REST (e.g. only ADMIN/EDITOR can create/update/delete initiatives).
- **`server/src/mcp/setup.ts`** — Mounts `mcpAuthRouter`, `/mcp-oauth/google/callback`, and `/mcp` with Bearer auth; creates one McpServer per session and uses Streamable HTTP transport.

### Configuration (server env)

- **Google (existing):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. For web login you already set `GOOGLE_CALLBACK_URL` to `https://<domain>/api/auth/google/callback`.
- **MCP callback:** In Google Cloud Console, add a **second** redirect URI: `https://<your-domain>/mcp-oauth/google/callback` (same OAuth client).
- **Optional:** `MCP_JWT_SECRET` — secret for signing JWTs; if unset, falls back to `SESSION_SECRET`.
- **Production base URL:** In production, OAuth redirects use `CLIENT_URL` as the base (so `CLIENT_URL` must be your public app URL, e.g. Railway).

### Cursor: local and remote

Use **local** when the DrD server is running on your machine (e.g. `npm run dev`). Use **remote** when you want to talk to the deployed app (e.g. on Railway).

**Get your Railway domain:** Railway dashboard → your service → Settings → Networking (e.g. `something.up.railway.app`), or use the **Railway MCP** in Cursor: call `generate-domain` with `workspacePath: "/Users/.../dd"` and optional `service: "server"`; it returns the public URL if a domain exists.

Example `.cursor/mcp.json` with both:

```json
{
  "mcpServers": {
    "drd-hub": {
      "url": "http://localhost:8080/mcp"
    },
    "drd-hub-remote": {
      "url": "https://replace-with-your-railway-host.up.railway.app/mcp"
    }
  }
}
```

Replace `replace-with-your-railway-host` with your actual Railway host (no tokens or env vars; Cursor discovers OAuth and opens the browser for Google login).

---

## Local MCP (stdio + API key)

### Architecture

```
┌─────────────┐     stdio      ┌──────────────────┐     HTTP + API Key     ┌─────────────────┐
│  Cursor /   │ ◄─────────────► │  MCP Server      │ ◄─────────────────────► │  DrD Hub API    │
│  MCP client │                  │  (mcp/ package)  │                         │  (Express)      │
└─────────────┘                  └──────────────────┘                         └─────────────────┘
```

- **MCP server** (`mcp/`): Standalone Node process, stdio transport. Exposes the same tool names, but calls the REST API with `Authorization: Bearer <DRD_API_KEY>`.
- **API auth:** Set `API_KEY` (and optionally `API_KEY_USER_ID`) on the server; requests with that Bearer token are authenticated as that user.

### Server env (for API key auth)

- `API_KEY` (optional): Bearer secret for MCP/API access.
- `API_KEY_USER_ID` (optional): User ID to impersonate when API key is used; if unset, first SUPER_ADMIN is used.

### MCP server env (stdio)

- `DRD_API_BASE_URL`: e.g. `http://localhost:8080`.
- `DRD_API_KEY`: same value as server `API_KEY`.

### Cursor (stdio only)

```json
{
  "mcpServers": {
    "drd-hub": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dd/mcp/dist/index.js"],
      "env": {
        "DRD_API_BASE_URL": "http://localhost:8080",
        "DRD_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

---

## Semantic mapping (product planning tree)

In the Hub, the hierarchy is used as follows:

| Model       | Semantic role   | Meaning |
|------------|-----------------|--------|
| Product    | Asset / bucket  | Top-level grouping (e.g. Dr Digital HUB). |
| Initiative | Epic            | Large planning unit; no separate "summary" initiative. |
| Feature    | User story      | Deliverable narrative with acceptance criteria. |
| Requirement| Task            | Atomic work item; status, assignee, due date, etc. |

Overview text for a product lives in the product description, not in a redundant summary initiative.

### Bootstrap: Dr Digital HUB tree

The **Dr Digital HUB** product is the canonical planning tree with four epics (initiatives):

1. **Epic: Naming & terminology** — stories/tasks 1.1–1.4  
2. **Epic: Bugs (fix first)** — stories (RACI, Initiative, Admin, Requirements, Accounts) and tasks 2.1–2.9  
3. **Epic: Feature/UX requirements** — stories (Initiative form & fields, Gantt, Milestones, Campaigns, Accounts, Products/assets) and tasks 3.1–3.24  
4. **Epic: Clarifications needed** — one or more stories and tasks 4.1–4.6  

**Import (idempotent):** From the repo root, run:

```bash
npm run db:populate-dr-hub --workspace server
```

Or from `server/`: `npx tsx scripts/populate-dr-digital-hub.ts`

Requires a domain named "Technologický Leader" (or similar); the script creates the product and the four initiatives if missing, then creates features and requirements. Re-running skips existing requirements (matched by feature + title).

**Verify:** Use MCP tool `drd_get_product_tree` with no arguments (first product) or with `productId` to return the full product → initiatives → features → requirements tree.

---

## MCP tools (same set for remote and local)

| Tool | Description |
|------|-------------|
| **Meta & health** | |
| `drd_health` | Check API health. |
| `drd_meta` | Meta: domains, products, accounts, partners, personas, revenue streams, users. |
| **Initiatives** | |
| `drd_list_initiatives` | List initiatives (optional: domainId, ownerId, horizon, priority, isGap). |
| `drd_get_initiative` | Get one initiative by ID. |
| `drd_create_initiative` | Create initiative (admin/editor). Optional: productId to assign to a product/asset. |
| `drd_update_initiative` | Update initiative by ID. Optional: productId to assign to a product/asset. |
| `drd_delete_initiative` | Delete initiative by ID. |
| **Reference data** | |
| `drd_list_domains` | List domains. |
| `drd_list_products` | List products. |
| `drd_create_product` | Create product/asset (admin/super_admin). name, optional description, sortOrder. |
| `drd_update_product` | Update product by ID. Optional: name, description, sortOrder. |
| `drd_get_product_tree` | Full tree: product → initiatives → features → requirements. Optional productId; if omitted returns first product. |
| `drd_list_personas` | List personas. |
| `drd_list_accounts` | List accounts. |
| `drd_list_partners` | List partners. |
| `drd_list_revenue_streams` | List revenue streams. |
| **KPIs, milestones, demands** | |
| `drd_list_kpis` | List initiative KPIs with initiative context. |
| `drd_list_milestones` | List initiative milestones. |
| `drd_list_demands` | List demands (accounts, partners, internal, compliance). |
| **Features, decisions, risks** | |
| `drd_list_features` | List features with initiative context (optional initiativeId). |
| `drd_create_feature` | Create feature (user story) under an initiative (admin/editor). initiativeId, title, optional description, acceptanceCriteria, storyPoints, storyType (FUNCTIONAL/BUG/TECH_DEBT/RESEARCH), ownerId, status, sortOrder. |
| `drd_update_feature` | Update feature by ID. Optional: title, description, acceptanceCriteria, storyPoints, storyType, ownerId, status, sortOrder. |
| `drd_list_decisions` | List decisions with initiative context (optional initiativeId). |
| `drd_list_risks` | List risks with initiative and owner (optional initiativeId). |
| **Dependencies, requirements, assignments, stakeholders** | |
| `drd_list_dependencies` | List initiative dependencies (from/to). |
| `drd_list_requirements` | List requirements with feature/initiative and assignee (optional featureId). Ordered by sortOrder, createdAt. |
| `drd_create_requirement` | Create requirement (task) under a feature (admin/editor). Full task payload: featureId, title, optional description, status (NOT_STARTED/IN_PROGRESS/DONE), isDone, priority, assigneeId, dueDate, estimate, labels, taskType (TASK/SPIKE/QA/DESIGN), blockedReason, externalRef, metadata, sortOrder. |
| `drd_update_requirement` | Update requirement by ID. Same optional task fields as create. |
| `drd_upsert_requirement` | Idempotent create-or-update by featureId + title or featureId + externalRef; use for imports. |
| `drd_list_assignments` | List initiative assignments (optional initiativeId). |
| `drd_list_stakeholders` | List stakeholders with initiative (optional initiativeId). |
| **Timeline** | |
| `drd_timeline_calendar` | Initiatives as calendar items (dates, domain, owner). |
| `drd_timeline_gantt` | Initiatives as Gantt tasks (progress, dependencies). |
| **Campaigns & assets** | |
| `drd_list_campaigns` | List campaigns with assets and links. |
| `drd_get_campaign` | Get one campaign by ID. |
| `drd_list_assets` | List campaign assets (optional campaignId). |
| `drd_list_campaign_links` | List campaign–initiative/feature/account/partner links (optional campaignId). |

Naming prefix `drd_` avoids clashes with other MCP tools. **Write** tools: initiative create/update/delete (and optional productId), product create/update, feature create/update, requirement create/update/upsert. All others are read-only. Settings and admin (audit, user management, import/export) are not exposed.

---

## Security

- **Remote (OAuth):** JWTs are short-lived (1 h); refresh tokens supported. PKCE (S256) is used. Permissions are enforced per tool from the real user role in the DB. Google client credentials are the same as for the web app.
- **Local (API key):** Keep `API_KEY` / `DRD_API_KEY` in env only; never commit. Use a dedicated user and role if you want to limit what agents can do.
- **Production:** Use HTTPS; `CLIENT_URL` and Google redirect URIs must use your real domain (e.g. Railway).

---

## Troubleshooting (MCP not working)

If Cursor shows **"The MCP server errored"** for `drd-hub` or `drd-hub-remote`, use these checks.

**`ECONNREFUSED 127.0.0.1:8080`** in the MCP log means the DrD Hub server is not running on your machine. Start it with `npm run dev` from the repo root so the `drd-hub` (local) MCP can connect.

**Expired token (JWTExpired):** If logs show `[MCP] Bearer auth / verifyAccessToken error: JWTExpired`, Cursor was using an expired access token. The server now returns **401** with `invalid_token` so the client can refresh or re-auth; re-enable the MCP in Cursor to trigger a new login or token refresh.

**`500 Internal Server Error` or `{"error":"server_error"}` from remote (`drd-hub-remote`)** means the deployed app (e.g. Railway) is reachable but the `/mcp` handler or auth layer is throwing. Check **Railway (or your host) logs** for the actual exception and stack trace. Common causes: missing or wrong env (`CLIENT_URL`, `DATABASE_URL`, `SESSION_SECRET`, `MCP_JWT_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`), DB unreachable, or an uncaught error in MCP/OAuth code. **In production, set `CLIENT_URL` to your public app URL** (e.g. `https://drdhub.up.railway.app`); if it stays default (`http://localhost:5173`), OAuth and MCP discovery can break and the server may return 500. The server logs a startup warning when it detects localhost in production.

**How to check Railway logs**

- **Via Railway MCP (Cursor):** Call the `get-logs` tool with `workspacePath: "/Users/supersergio/projects/dd"` (or your repo path), `logType: "deploy"`, and optionally `lines: 150` and `filter: "error"` or `filter: "MCP"` to focus on errors. Reproduce the 500 (enable `drd-hub-remote` in Cursor), then fetch logs again to see the stack trace.
- **Via Railway CLI:** From the project directory run `railway logs` to stream deploy logs, or `railway logs --lines 200` for recent lines, or `railway logs --lines 200 --filter '@level:error'` to filter. Ensure the project is linked (`railway link` if needed).

### 1. Is the server running? (local only)

- From repo root: `npm run dev` (runs server + client).
- Server listens on **port 8080** by default (`PORT` in `server/.env` or `server/.env.example`).

```bash
# Should return {"ok":true}
curl -s http://localhost:8080/api/health
```

If this fails, start the server and ensure nothing else is using port 8080.

### 2. Is the MCP endpoint reachable?

- **Local:** `curl -i -X POST http://localhost:8080/mcp`  
  Expected: **401** with `WWW-Authenticate` (OAuth metadata). That means the MCP route is up and auth is required.
- **Remote:** `curl -i -X POST https://drdhub.up.railway.app/mcp`  
  Same expectation (401 + OAuth). If you get connection refused or timeout, the deployment or URL is wrong.

### 3. Cursor MCP config

- **Settings → Tools & MCP** and open the failed server (`drd-hub` or `drd-hub-remote`). Check the **exact error** (e.g. "Connection refused", "401", "ECONNREFUSED").
- **Local:** URL must be `http://localhost:8080/mcp` (no trailing slash). If your API runs on another port, change the URL to match (e.g. `http://localhost:3000/mcp`).
- **Remote:** URL must be your real Railway (or other) host, e.g. `https://drdhub.up.railway.app/mcp`. Ensure the app is deployed and the domain is correct.

### 4. OAuth (remote, and local if Cursor uses OAuth)

- For **remote**, first connection triggers Google login. Ensure in **Google Cloud Console** the OAuth client has the redirect URI:  
  `https://<your-mcp-domain>/mcp-oauth/google/callback`  
  (e.g. `https://drdhub.up.railway.app/mcp-oauth/google/callback`).
- Server env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and in production `CLIENT_URL` (and any callback URL) must use the real public base URL.

### 5. Retry after fixes

- Restart Cursor, or in **Settings → MCP** disable and re-enable the server so it reconnects and re-lists tools.

---

## Summary

- **Remote MCP** = same Express server, `/mcp` + OAuth routes, Google login, per-user identity. Configure Cursor with `url: "https://<your-domain>/mcp"` and add `https://<your-domain>/mcp-oauth/google/callback` in Google Console.
- **Local MCP** = `mcp/` package, stdio, API key. Configure Cursor with `command` + `args` + `env` for `DRD_API_BASE_URL` and `DRD_API_KEY`.
- You can have both in `.cursor/mcp.json` (e.g. `drd-hub` for local, `drd-hub-remote` for production).

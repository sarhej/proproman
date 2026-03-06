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

## MCP tools (same set for remote and local)

| Tool | Description |
|------|-------------|
| **Meta & health** | |
| `drd_health` | Check API health. |
| `drd_meta` | Meta: domains, products, accounts, partners, personas, revenue streams, users. |
| **Initiatives** | |
| `drd_list_initiatives` | List initiatives (optional: domainId, ownerId, horizon, priority, isGap). |
| `drd_get_initiative` | Get one initiative by ID. |
| `drd_create_initiative` | Create initiative (admin/editor). |
| `drd_update_initiative` | Update initiative by ID. |
| `drd_delete_initiative` | Delete initiative by ID. |
| **Reference data** | |
| `drd_list_domains` | List domains. |
| `drd_list_products` | List products. |
| `drd_list_personas` | List personas. |
| `drd_list_accounts` | List accounts. |
| `drd_list_partners` | List partners. |
| `drd_list_revenue_streams` | List revenue streams. |
| **KPIs, milestones, demands** | |
| `drd_list_kpis` | List initiative KPIs with initiative context. |
| `drd_list_milestones` | List initiative milestones. |
| `drd_list_demands` | List demands (accounts, partners, internal, compliance). |

Naming prefix `drd_` avoids clashes with other MCP tools.

---

## Security

- **Remote (OAuth):** JWTs are short-lived (1 h); refresh tokens supported. PKCE (S256) is used. Permissions are enforced per tool from the real user role in the DB. Google client credentials are the same as for the web app.
- **Local (API key):** Keep `API_KEY` / `DRD_API_KEY` in env only; never commit. Use a dedicated user and role if you want to limit what agents can do.
- **Production:** Use HTTPS; `CLIENT_URL` and Google redirect URIs must use your real domain (e.g. Railway).

---

## Summary

- **Remote MCP** = same Express server, `/mcp` + OAuth routes, Google login, per-user identity. Configure Cursor with `url: "https://<your-domain>/mcp"` and add `https://<your-domain>/mcp-oauth/google/callback` in Google Console.
- **Local MCP** = `mcp/` package, stdio, API key. Configure Cursor with `command` + `args` + `env` for `DRD_API_BASE_URL` and `DRD_API_KEY`.
- You can have both in `.cursor/mcp.json` (e.g. `drd-hub` for local, `drd-hub-remote` for production).

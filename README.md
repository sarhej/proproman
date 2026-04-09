# Tymio

**Multi-tenant product and project management hub** — [tymio.app](https://tymio.app)

Full documentation: **[docs/HUB.md](docs/HUB.md)** (scope, architecture, multi-tenancy, development, deployment, MCP, security).

## Stack

- Frontend: React + Vite + TypeScript + Tailwind  
- Backend: Express + TypeScript + Prisma  
- Database: PostgreSQL  
- Auth: Google OAuth (sessions)  
- Agents: MCP at `/mcp` (OAuth) + optional stdio MCP in `mcp/`

## Quick start

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
# Configure DATABASE_URL, SESSION_SECRET, Google OAuth (see docs/HUB.md)
npm run db:generate
npm run db:migrate --workspace server -- --name init
npm run db:seed    # optional demo data only
npm run dev
```

Optional local auth: `ALLOW_DEV_AUTH=true` in `server/.env` and `VITE_ENABLE_DEV_LOGIN=true` in `client/.env` (development only).

## MCP (Cursor and agents)

- **Remote (recommended):** point MCP at `https://<your-host>/mcp` — OAuth; **no API key in the Tymio UI** for users to copy.  
- **Stdio npm package:** [`@tymio/mcp-server`](mcp/README.md) — default mode uses OAuth (`tymio-mcp login`); full agent guide in [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md).  
- **Optional API-key stdio:** set `DRD_API_KEY` / `API_KEY` on the **stdio process** only for the REST tool subset — that value is the **server deployment** secret, not something users get from Settings.

Public JSON for agents: `GET /api/mcp/agent-context` (includes `tymioMcpCliAgentGuidanceMarkdown`, `tymioMcpNoUserSettingsApiKey: true`). Details: **[docs/HUB.md](docs/HUB.md)** §6, **[docs/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](docs/TYMIO_MCP_CLI_AGENT_GUIDANCE.md)**.

## Deploy

Railway (or any Node host): Postgres, env from `server/.env.example`, set OAuth callback URLs (`GOOGLE_CALLBACK_URL`, optional `MICROSOFT_CALLBACK_URL`) and `CLIENT_URL`, optional Resend for email magic link (`RESEND_API_KEY`, `RESEND_FROM`, and `API_PUBLIC_URL` when the API origin differs from the SPA). Run migrations. Do **not** run full `db:seed` in production.

# Workspace access request — testing

Automated coverage lives in three layers:

1. **Unit / HTTP mocks** — `server/src/routes/me.workspace-access-request.test.ts`, `server/src/lib/workspaceAccessRequest.test.ts`, `client/src/pages/TenantWorkspaceNoAccessPage.test.tsx`, `client/src/App.workspaceSlugGate.test.tsx`.
2. **Browser (mocked API)** — Playwright specs under `e2e/specs/`:
   - `workspace-access-request.spec.ts` — full UI flows for Request access, errors, platform `PENDING`, Continue.
   - `workspace-signed-in-no-member.spec.ts` — gate visibility; mocks include `GET/POST /api/me/workspace-access-request`.
3. **Database integration** — `server/src/routes/me.workspace-access-request.integration.test.ts` (run with `RUN_DB_INTEGRATION_TESTS=1`; see `server/package.json` script `test:integration`). The suite is **skipped** until migration `20260416120000_workspace_access_request` is applied (`npx prisma migrate deploy` in `server/`).

## Commands

```bash
# Client + server unit tests (root)
npm test

# Playwright (starts Vite; mocks `/api` in tests)
npm run test:e2e:install   # once per machine
npm run test:e2e -- e2e/specs/workspace-access-request.spec.ts e2e/specs/workspace-signed-in-no-member.spec.ts

# Full DB integration (requires migrated DB + DATABASE_URL)
npm run test:integration --workspace server
```

## Manual “real login” checklist (local stack)

Use this when you want OAuth or magic link against a **running** API + client (not Playwright mocks).

**Prerequisites**

- Postgres up, migrations applied: `npm run db:up` (from repo root) or equivalent.
- `npm run dev` (server on **8080**, client on **5170** or Vite default **5173** per your setup).
- A workspace slug that is **ACTIVE** in the DB and **not** listing your test user as a member (e.g. create an empty tenant in admin, provision to ACTIVE, do not add your user).

**Steps**

1. Open `http://127.0.0.1:5173/t/<that-slug>` (adjust port if needed).
2. Sign in with Google, Microsoft, or magic link (real provider / inbox).
3. Confirm the **“You are not in this workspace yet”** card appears with the correct workspace name and `/t/...` path.
4. Click **Request access**:
   - Expect success copy (with or without “admins were emailed” depending on `TRANSACTIONAL_EMAIL_ENABLED` / Resend).
   - Button should disable; reload page → still shows pending state if row exists.
5. As an **OWNER/ADMIN** of that workspace, confirm email (if enabled) or add the user in **Workspace settings** → member list.
6. Reload `/t/<slug>` → app should switch into the workspace (or prompt tenant pick) instead of the no-access card.

**Optional dev shortcut**

With `ALLOW_DEV_AUTH=true` (server) and `VITE_ENABLE_DEV_LOGIN=true` (client), dev login is available on the landing and tenant slug sign-in pages. It **adds** the dev user to the selected workspace, so it does **not** by itself reproduce “no membership” for that slug. For the no-access screen, use a second workspace where the dev user is not a member, or use a separate browser profile / account.

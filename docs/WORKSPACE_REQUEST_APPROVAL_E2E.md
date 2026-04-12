# End-to-end: workspace request with approval (and magic-link testing)

This document ties together **product behavior**, **APIs**, **admin approval**, and **how to exercise the flow without Google OAuth** (email magic link + optional dev login). It complements the visual specs in:

- [designs/REGISTER_WORKSPACE_WIREFRAMES.svg](./designs/REGISTER_WORKSPACE_WIREFRAMES.svg) — public `/register-workspace`, OAuth or email, submit request
- [designs/WORKSPACE_SELECTOR_REQUEST_WORKSPACE.svg](./designs/WORKSPACE_SELECTOR_REQUEST_WORKSPACE.svg) — in-app “Request new workspace” from the tenant switcher
- [designs/TENANT_USER_ONBOARDING_FLOWS.svg](./designs/TENANT_USER_ONBOARDING_FLOWS.svg) — state machine, security notes, test file pointers
- [TRANSACTIONAL_EMAIL_PLAN.md](./TRANSACTIONAL_EMAIL_PLAN.md) — E1/E2/E5 mail events around requests

## What already exists (no greenfield design)

| Layer | What you get |
|--------|----------------|
| **Public submit** | `POST /api/tenant-requests` creates a `TenantRequest` in **PENDING** (no session required). Optional `AUTO_APPROVE_WORKSPACE_REQUESTS` auto-provisions; **for approval flow, keep that unset/false.** |
| **Requester visibility** | Signed-in users list their requests via `GET /api/me/workspace-registration-requests` (session). UI: register success, tenant picker empty state, switcher “Applications”. |
| **Super-admin review** | Admin app: tenant requests list + approve/reject → `POST /api/tenant-requests/:id/review` with `{ action: "approve" \| "reject", reviewNote? }`. Server runs provisioning, OWNER membership, optional trusted domain + invitees. |
| **Email** | On submit: notify super-admins (E1 family). On approve: requester (E2), invitees (E5) when configured — see transactional plan. |
| **Tests** | `server/src/routes/tenant-requests.approval.test.ts`, `tenant-requests.integration.test.ts`, `tenant-requests.test.ts`; client/admin covered in unit/integration tests. Playwright under `e2e/` **mocks** APIs and does **not** run this full chain today. |

## Preconditions (environment)

1. **Database** migrated; **no** `AUTO_APPROVE_WORKSPACE_REQUESTS` (or set to false) if you want manual approval.
2. **Magic link (requester sign-in without Google)**  
   - `RESEND_API_KEY`, `RESEND_FROM` (and `API_PUBLIC_URL` if API host ≠ app origin).  
   - See [IDENTITY_AUTH_STRATEGY.md](./IDENTITY_AUTH_STRATEGY.md) and [HUB.md](./HUB.md).
3. **Transactional mail** (optional but realistic): same Resend setup + templates enabled so E1/E2 behave like production.
4. **Super admin** account to use the **admin** SPA (same auth as hub; role `SUPER_ADMIN`).

## Flow A — Requester: magic link only (no Google)

Goal: a **new** email identity requests a workspace and stays informed until approval.

1. **Open** the public registration surface  
   - e.g. `https://<app>/register-workspace` (or your deployed equivalent).  
   - Wireframe reference: REGISTER_WORKSPACE_WIREFRAMES (screen A/B).

2. **Sign in with email**  
   - On the main sign-in experience, use **email magic link** (`POST /api/auth/email/request` → message in inbox → `GET /api/auth/email/verify?token=…`).  
   - **Retrieving the link:** there is **no** production API that returns the raw token (by design). For QA: use the inbox, **Resend** dashboard/logs, or a **staging** mailbox you control.

3. **After session exists**, complete **workspace name**, **slug**, optional message / invites / trusted domain (same payload rules as public POST).

4. **Submit** → `POST /api/tenant-requests` → **201** with `PENDING` (unless auto-approve).  
   - UI should show success + request id and “check email” copy.

5. **Wait for decision**  
   - Optional: `GET /api/tenant-requests/status/:id` if the UI exposes a status link (public, by id — see router tests).  
   - Or stay signed in and refresh **workspace registration requests** / slug landing states per TENANT_USER_ONBOARDING_FLOWS.

6. **On approve**  
   - Requester receives **E2** (if mail enabled).  
   - User record is promoted / `activeTenantId` set server-side during approval; opening **`/t/<slug>`** should eventually resolve to an **ACTIVE** tenant and allow hub access as **OWNER**.

7. **On reject**  
   - Request **REJECTED**; slug public lookup shows rejected path (see `TenantSlugLoginPage` + lookup tests).

## Flow B — Super admin: approve in admin app

1. Sign in to the **admin** frontend (super-admin role). Use **Google/Microsoft** or magic link the same way as the main app if those providers are configured.

2. Open **tenant / workspace requests** (the management view that loads `GET /api/tenant-requests?status=PENDING`).

3. For a **PENDING** row, choose **Approve** (or **Reject** with an optional note).

4. **Approve** triggers server-side: tenant create → `provisionTenant` → link `TenantRequest.tenantId` → OWNER on contact user → optional `TenantDomain` + invitee users + side effects + **E2/E5** sends.

5. Verify in DB or UI: new tenant **ACTIVE** (after provisioning), request **APPROVED**.

## Flow C — Already signed-in user: “Request new workspace” from switcher

Same backend as Flow A step 4, different entry (modal + read-only contact). Spec: [WORKSPACE_SELECTOR_REQUEST_WORKSPACE.svg](./designs/WORKSPACE_SELECTOR_REQUEST_WORKSPACE.svg). After submit, `GET /api/me/workspace-registration-requests` should show the new row on next fetch.

## Automation and “automatic” magic link

| Approach | Fits |
|----------|------|
| **Server mocked HTTP flow** | `server/src/routes/tenant-requests.onboarding.flow.test.ts` — always runs with `npm run test --workspace server`: public **POST** → **GET status** PENDING → **SUPER_ADMIN approve** → **ACTIVE** tenant + **APPROVED** status (DB mocked). |
| **Existing server integration tests** | `tenant-requests.integration.test.ts` with `RUN_DB_INTEGRATION_TESTS=1`: real Postgres **approve/reject** + slug public check. |
| **Playwright today (`e2e/`)** | **Mocked** `/api/*`; good for loading/UX, **not** for real approval chain. |
| **True browser E2E with magic link** | Needs **either** (a) a test inbox (e.g. Mailpit/Mailosaur) + parsing the verify URL, or (b) a **non-production-only** hook such as logging the verify URL when `NODE_ENV !== "production"` — **not implemented** in this repo; add only with explicit security review. |
| **Local role bypass** | `ALLOW_DEV_AUTH=true` + `POST /api/auth/dev-login` skips OAuth/magic link for **dev**; useful to test **admin approval** or **post-approval** hub without mail, **not** a substitute for the real requester magic-link path. |

## Quick API cheat sheet

- `POST /api/tenant-requests` — public create (body: `teamName`, `slug`, `contactName`, `contactEmail`, optional fields per schema in `server/src/routes/tenant-requests.ts`).
- `GET /api/tenant-requests` — super-admin list (auth + role).
- `POST /api/tenant-requests/:id/review` — super-admin approve/reject.
- `GET /api/me/workspace-registration-requests` — session: caller’s requests.
- `POST /api/auth/email/request` + `GET /api/auth/email/verify` — magic link.

## Related code (starting points)

- Server router: `server/src/routes/tenant-requests.ts` (`approveTenantRequestRecord`, public POST, review POST).
- Session list: `server/src/routes/me.ts` (`/workspace-registration-requests`).
- Magic link: `server/src/routes/auth.ts` (`/email/request`, `/email/verify`).
- Admin UI: `admin/src/App.tsx` (`TenantManagement`, `reviewTenantRequest`).

When you add a **Playwright** spec that hits a **real** API, prefer a dedicated test stack (seed DB + super-admin via dev-login or fixture) and **do not** enable magic-link URL leakage in production builds.

# Transactional email notifications — implementation & testing plan

This document defines scope, architecture, environment, rollout phases, and **full testing strategy** for platform transactional emails (Resend). It is the source of truth until implementation is complete; update it when scope changes.

---

## 1. Goals

- **Honour UI copy** where we promise email (workspace registration approval flow).
- **Notify the right people** at the right time without blocking critical HTTP paths.
- **Single channel implementation** (Resend), consistent with existing magic-link mail ([`server/src/services/mailer.ts`](../server/src/services/mailer.ts)).
- **Testable in CI** without calling Resend or sending real mail.

## 2. Non-goals (initial phases)

- Replacing or fully wiring the existing **in-app notification** pipeline (`notification-delivery.ts` audit → `UserMessage`) for EMAIL (that path is IN_APP-only today and EMAIL rows are placeholders).
- **Access-request** flow (“notify all workspace admins someone wants in”) — requires a new API + persistence; planned as **Phase B** (see §8).
- Marketing digests, Slack/WhatsApp for these events.
- Beautiful HTML templates v2 (start with plain, accessible HTML + text parts).

---

## 3. Event → email matrix (MVP vs later)

| # | Event | Recipients | MVP? | Trigger location (planned) |
|---|--------|------------|------|----------------------------|
| E1 | New `TenantRequest` created (`POST /api/tenant-requests`) | All `User` with `role === SUPER_ADMIN` (unique emails) | **Yes** | After successful `create` in [`tenant-requests.ts`](../server/src/routes/tenant-requests.ts) |
| E2 | Tenant request **approved** | `contactEmail` on request | **Yes** | After successful approve in `POST .../review` ([`tenant-requests.ts`](../server/src/routes/tenant-requests.ts)) |
| E3 | Tenant request **rejected** | `contactEmail` | **Yes** | Same handler, reject branch |
| E4 | Platform role changed **from** `PENDING` **to** non-PENDING | That user’s primary email | **Yes** | After `user.update` in [`admin.ts`](../server/src/routes/admin.ts) `PUT /users/:id` when `existing.role === PENDING` and `data.role` is set and not `PENDING` (SUPER_ADMIN actor only for safest first cut, or any admin — decide in §5.3) |
| E5 | User opened `/t/{slug}`, authenticated, workspace exists, **no membership** | All workspace `OWNER` + `ADMIN` members | **Phase B** | New `POST` e.g. `/api/me/workspace-access-request` + optional rate limit |
| E6 | Provisioning fails after approve | SUPER_ADMIN + optional `contactEmail` | **Later** | `provisionTenant` / job error path |

**Note:** E4 may overlap E2 when approval creates/upgrades the contact user — avoid **duplicate** emails in one transaction (see §6.3).

---

## 4. Configuration (`env`)

Add to [`server/src/env.ts`](../server/src/env.ts) (all optional strings unless noted):

| Variable | Purpose |
|----------|---------|
| `TRANSACTIONAL_EMAIL_ENABLED` | `true` to send E1–E4; if false or unset, **no-op** (log debug in dev). Allows prod deploy before copy is perfect. |
| `PLATFORM_NOTIFY_EMAILS` | Comma-separated list for E1/E6 fallback **if** no SUPER_ADMIN rows (e.g. `s@tymio.app`). Normal case: derive recipients from DB `User.role === SUPER_ADMIN`. |

**Reuse existing:** `RESEND_API_KEY`, `RESEND_FROM`, `CLIENT_URL`, `API_PUBLIC_URL` (link base = `CLIENT_URL` for “open app” links; API paths only when linking to verify endpoints).

**Documentation:** `.env.example` or internal runbook (do not commit secrets). Railway/host: set `TRANSACTIONAL_EMAIL_ENABLED=true` when Resend is configured.

---

## 5. Architecture

### 5.1 Module layout

- **`server/src/services/transactionalMail.ts`** (new)  
  - `isTransactionalEmailEnabled(): boolean`  
  - `sendTransactionalEmail({ to, subject, text, html, tags? }): Promise<void>` — wraps Resend; throws on Resend error (caller decides catch).  
  - Thin wrapper: if `!RESEND_API_KEY || !RESEND_FROM` or `!TRANSACTIONAL_EMAIL_ENABLED`, return early (no throw) and optionally `console.warn` once per process in dev.

- **`server/src/services/transactionalTemplates.ts`** (new, pure)  
  - Functions building `{ subject, text, html }` + link URLs from typed inputs (request id, team name, slug, review note, sign-in URL).  
  - **Unit-tested** without network.

- **`server/src/services/transactionalRecipients.ts`** (new)  
  - `getSuperAdminEmails(): Promise<string[]>` — distinct active users, lowercased, deduped.  
  - `getWorkspaceAdminEmails(tenantId): Promise<string[]>` — for Phase B (OWNER + ADMIN memberships).  
  - **Unit/integration tested** with Prisma test DB or mocked `prisma`.

### 5.2 Link conventions

- **Sign in / open app:** `${CLIENT_URL}/` or `${CLIENT_URL}/t/{slug}` when slug known.  
- **Optional “track request”:** `${CLIENT_URL}/` + query not required for MVP; platform admins use `/platform` (document in email body as plain URL).

### 5.3 Authorization notes

- **E4:** Only fire when role actually transitions off `PENDING`. Prefer **SUPER_ADMIN** actor only for v1 to avoid workspace admins accidentally promoting platform users if API ever allows. If product requires workspace ADMIN to clear PENDING, document and test separately.

### 5.4 HTTP behaviour

- **E1:** `POST /tenant-requests` must return **201** even if email fails — `try/catch` around send, log error, optional metric.  
- **E2/E3:** Same for `review` response **200**.  
- **E4:** Same for `PUT /admin/users/:id`.

---

## 6. Design decisions

### 6.1 Idempotency

- E2/E3: one email per state transition (handler runs once per approve/reject).  
- E4: only when `existing.role === PENDING` && new role !== `PENDING`.

### 6.2 Duplicate avoidance (approve + E4)

When tenant request is **approved**, code already promotes `contactUser` from `PENDING` to `ADMIN` (or keeps SUPER_ADMIN). **Do not** send both “workspace approved” (E2) and “account activated” (E4) for the same approval.  
**Rule:** On approve path, send **E2 only** (includes sign-in + workspace slug). E4 only for **manual** promotion in admin UI / other code paths that change PENDING → X without going through tenant approve.

### 6.3 Rate limiting

- E1 to super admins: max 1 email per new request (obvious).  
- Optional: throttle repeated E5 in Phase B per `(email, slug)` window.

---

## 7. Copy alignment (after MVP behaviour matches)

- Keep [`register.successDesc`](../client/src/i18n/en.json) / `tenant.requestNewWorkspaceIntro` **only if** E2/E3 implemented or gated by `TRANSACTIONAL_EMAIL_ENABLED` with softer fallback copy when disabled.  
- Add one line in success UI when email disabled: “You may not receive email if notifications are off; check status with your admin.” (optional, i18n).

---

## 8. Phase B — workspace access request

1. **Model** (Prisma): e.g. `WorkspaceAccessRequest { id, tenantId, userId, email, createdAt, status }` with unique constraint `(tenantId, userId)` for pending.  
2. **API:** `POST /api/me/workspace-access-request` with `tenantSlug` or `tenantId` (session user must be authenticated; PENDING allowed if `requireSession`).  
3. **Email E5:** to OWNER+ADMIN emails for that tenant (batch individual sends or BCC policy — product/legal choice; default **individual** sends for clearer audit).  
4. **Tests:** integration same as E1 with tenant + memberships seeded.

---

## 9. Testing strategy (full)

### 9.1 Principles

- **No real Resend in CI.** Mock `Resend` constructor + `.emails.send` or mock `sendTransactionalEmail` at module boundary.  
- **Assert:** recipient(s), subject contains expected substring, body contains slug / link fragment.  
- **Regression:** HTTP status and JSON body unchanged when email throws (201/200 still).

### 9.2 Unit tests (Vitest)

| File | What |
|------|------|
| `server/src/services/transactionalTemplates.test.ts` | Each template: correct subject, includes `teamName`, `slug`, `reviewNote` when present, escapes HTML in user-controlled strings. |
| `server/src/services/transactionalRecipients.test.ts` | `getSuperAdminEmails`: empty DB, one SUPER_ADMIN, multiple, inactive user excluded. |

### 9.3 Integration tests (Vitest + supertest)

**Pattern:** `vi.mock("../services/transactionalMail.js", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue(undefined) }))` **or** mock Resend at package level. Import the mock in test and `expect(sendTransactionalEmail).toHaveBeenCalledWith(...)` or inspect calls.

| Suite | Cases |
|-------|--------|
| **E1** `tenant-requests.integration.test.ts` (extend) or new `tenant-requests.transactional-email.test.ts` | (a) `TRANSACTIONAL_EMAIL_ENABLED` false → 201, **zero** sends. (b) true + Resend configured mock → 201, **one** call per super admin (or consolidated if product chooses single email with BCC). (c) No super admins + `PLATFORM_NOTIFY_EMAILS` set → sends to listed. (d) Send throws → still 201, error logged (spy on `console.error`). |
| **E2/E3** | Approve: 200, mock called once with `contactEmail`. Reject with note: body contains note. Reject without note: still one email. |
| **E4** | `PUT /api/admin/users/:id` with PENDING user, actor SUPER_ADMIN, body `{ role: "VIEWER" }` → 200 + one email to user. Same request idempotent? Second PUT same role → no second email. PENDING → PENDING no-op. |

**Fixtures:** Reuse patterns from [`tenant-requests.integration.test.ts`](../server/src/routes/tenant-requests.integration.test.ts) and [`admin.users-tenant.test.ts`](../server/src/routes/admin.users-tenant.test.ts) for auth headers and tenant context.

### 9.4 E2E (Playwright) — optional, low priority

- Not required for MVP if integration tests cover HTTP + mock.  
- If added: smoke only in env with test Resend or mail catcher (usually skipped in CI).

### 9.5 Manual QA checklist (staging)

- [ ] Create tenant request → super admin receives email (Resend dashboard + inbox).  
- [ ] Approve → contact receives email with `/t/slug` link.  
- [ ] Reject → contact receives email with reason.  
- [ ] Promote PENDING user in admin → user receives email.  
- [ ] Toggle `TRANSACTIONAL_EMAIL_ENABLED=false` → no emails, app still works.

---

## 10. Rollout phases

| Phase | Deliverable |
|-------|-------------|
| **P0** | `transactionalMail` + templates + recipients; E1–E3; env flags; integration + unit tests; align or gate client copy. |
| **P1** | E4 with duplicate rule vs approve; admin integration tests. |
| **P2** | Phase B access request + E5; migrations; tests. |
| **P3** | E6 provisioning failure; optional retries / dead letter log table. |

---

## 11. Observability

- Structured log: `[transactional-email] event=E1 requestId=... toCount=... ok=true`.  
- On failure: `ok=false` + error message (no PII in log).  
- Optional later: metrics counter `transactional_email_sent_total` / `failed_total`.

---

## 12. Open questions (resolve before coding)

1. **E1 recipient list:** All SUPER_ADMIN emails vs single `PLATFORM_NOTIFY_EMAILS` only — **recommendation:** DB SUPER_ADMINs + optional CC from `PLATFORM_NOTIFY_EMAILS` to avoid missing ops if DB empty.  
2. **E2 content:** Include temporary password? **No** — OAuth/magic link only; link to sign-in page.  
3. **From address:** Same `RESEND_FROM` for all transactional vs separate “noreply” — start with same.

---

## 13. Approval

- [ ] Product: event matrix and copy.  
- [ ] Engineering: env vars on staging/prod.  
- [ ] Legal: transactional email content (footer, company address if required).

After sign-off, implement **P0** first, then run `npm test` at repo root before merge.

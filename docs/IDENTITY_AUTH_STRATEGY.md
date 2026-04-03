# Identity & authentication strategy (Tymio)

Concise reference: goals, provider tiers, passkeys vs Apple, hosting context, and a **detailed P0 plan** (email + Google + Microsoft) aligned with this repo.

**Canonical product:** [tymio.app](https://tymio.app) — see [HUB.md](./HUB.md) for architecture and tenancy.

---

## 1. Principles

- **One internal user** per person: stable **`User.id`** (CUID today in `server/prisma/schema.prisma`). Optional public **`slug` / handle** later for URLs — prefer **opaque `id`** for sessions, FKs, and audit; slugs can change.
- **Many sign-in methods → same user**: OAuth subjects, verified emails (`User` + `UserEmail` aliases), and later **wallet addresses** are **identities** attached to one user. Resolution order today: `googleId`, then **`UserEmail`**, then **`User.email`** (see `server/src/auth/passport.ts`, `server/src/mcp/oauth-provider.ts`).
- **Multitenancy** is unchanged: after auth, **`TenantMembership`** + `activeTenantId` / session — not owned by any IdP.
- **Railway** hosts the app; it does **not** provide end-user auth (only [Login with Railway](https://docs.railway.app/integrations/oauth) for third-party tools using the Railway API, and enterprise SAML for **Railway dashboard** access).
- **Cloudflare** (optional in front of the API) can add **Access JWT verification**, **API Shield JWT**, **Turnstile** on forms — not a replacement for application login; see prior research in team notes.

---

## 2. Provider priority matrix

| Tier | Providers / capability | Role |
|------|-------------------------|------|
| **P0** | **Email** (magic link and/or password + reset), **Google**, **Microsoft** (Entra ID + consumer Microsoft accounts per app registration) | Universal + work-account coverage; baseline for production. |
| **P1** | **GitHub**, **Sign in with Apple**, **wallet / SIWE** (EIP-4361), **WebAuthn passkeys** (after an account anchor exists) | Devtools audience, iOS rules & privacy, crypto roadmap, passwordless UX. |
| **P2** | **SAML / OIDC (generic, customer IdP)** | Enterprise deals (Okta, customer Entra, Ping, …). |
| **P3** | **LinkedIn**, **Discord**, **X (Twitter)** | Segment / brand; not core for default B2B + dev workflows. |

**Passkeys (WebAuthn)** are **not** a separate “social” row: same standard everywhere (**Windows Hello**, **Android**, **iCloud Keychain**, **security keys**). Implement as **credential registration + assertion** tied to `User.id`, optionally after OAuth/email/wallet.

**Sign in with Apple** = Apple as **IdP** (OIDC-style). **Passkeys** = **your** site as relying party. Different protocols; both can coexist.

---

## 3. P0 — detailed plan

**Objective:** Any user can sign in with **verified email** (magic link or password), **Google**, or **Microsoft**, with one **`User`** record and existing **`UserEmail`** linking behavior preserved.

**Already in repo**

- **Google OAuth**: Passport (`server/src/auth/passport.ts`), routes `/api/auth/google`, `/api/auth/google/callback` (`server/src/routes/auth.ts`), `tenantSlug` handoff for `/t/:slug`.
- **Env**: `GOOGLE_*`, `SESSION_SECRET`, `CLIENT_URL` (`server/src/env.ts`, `server/.env.example`).
- **Aliases**: `UserEmail` + admin CRUD (`server/src/routes/admin.ts`); login resolution by alias in Passport + MCP.

### 3.1 Product decisions (lock before build)

| Decision | Options | Notes |
|----------|-----------|--------|
| **Email auth style** | **Magic link** vs **password** | Magic link: fewer secrets to store; **requires Resend** (or similar API) for delivery. Password: **bcrypt/argon2** + reset flow + breach hygiene. |
| **Microsoft tenants** | Single app: **consumers + orgs** vs separate apps | One Azure app with **supported account types** including personal + work/school is typical for “Sign in with Microsoft.” |
| **New user default role** | Same as today (`autoRoleForGoogleEmail` / `PENDING`) | Extend or generalize for non-Google emails. |
| **MCP browser OAuth** | Keep parity with web user resolution | `server/src/mcp/oauth-provider.ts` today mirrors Google-only user creation; must use the **same resolver** as Passport after P0. |

### 3.2 Data model

- **Minimum for magic link:** table or KV for **hashed tokens** (or one-time codes): `userId?`, `email`, `expiresAt`, `usedAt`, `purpose` (`login` | `verify`). No password column.
- **Minimum for password:** `passwordHash` on `User` (or on an `identity` row), `emailVerifiedAt`, optional `passwordResetToken` + expiry.
- **Recommended cleanup:** introduce **`UserIdentity`** (or equivalent): `(userId, provider, providerSubject)` unique — migrate **`googleId`** into `provider=google`, add `microsoft`, `email`, etc. **Can be phased** after P0 if timeboxed; otherwise add **`microsoftId`** mirroring `googleId` and refactor in P1.

### 3.3 Environment & configuration

- Add (names illustrative): `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL` (or generic `OAUTH_REDIRECT_BASE` + paths).
- **Relax** `server/src/env.ts` so **production** requires **at least one** of: Google, Microsoft, email provider config — not “Google only.”
- **Resend** (magic link): `RESEND_API_KEY`, `RESEND_FROM` (verified sender in Resend); optional `API_PUBLIC_URL` for link URLs when the API is not same-origin as `CLIENT_URL`.

### 3.4 Backend — Passport & routes

1. Register **Microsoft strategy** (`passport-azure-ad` OIDC common endpoint, or `passport-oauth2` against `login.microsoftonline.com` / `consumers` as needed).
2. Mirror Google behavior: **`GET /api/auth/microsoft`**, **`GET /api/auth/microsoft/callback`**; same `pendingTenantSlug` + `autoSwitchToSlug` pattern as `auth.ts`.
3. Implement **`resolveOrCreateUserFromOAuthProfile`** (single function): inputs — provider, subject id, email, name, avatar; logic — find by provider id → find by `UserEmail` / `User.email` → link or create → `logAudit` — call from Google + Microsoft + future Apple.
4. **Email routes** (if P0 includes email in scope):
   - `POST /api/auth/email/request` — body: email; send link or 404-safe response (anti-enumeration policy).
   - `GET /api/auth/email/callback` — token validation, `req.login`, redirect like Google.
   - Or `POST /api/auth/register` + `POST /api/auth/login` for password variant.
5. **Rate limiting** on email send and OAuth starts (per IP + per email bucket).
6. **Sessions:** unchanged (PostgreSQL store); ensure cookie options remain correct for `CLIENT_URL`.

### 3.5 MCP alignment

- Replace duplicated “Google-only” user resolution in `server/src/mcp/oauth-provider.ts` with the **same** `resolveOrCreateUserFromOAuthProfile` (or shared module imported by both).
- Any new OAuth callback used by MCP must land on the same user rows as the web app.

### 3.6 Frontend

- **Wireframes** in `docs/designs/` (per project rules): sign-in with **Email** + **Google** + **Microsoft**, errors, loading — approve before heavy UI polish.
- **Entry points:** replace or extend single Google button (`client/src/App.tsx` and any other login surfaces).
- **i18n:** add keys in `client/src/i18n/*.json` for all locales (`en`, `cs`, `sk`, `uk`, `pl`).

### 3.7 Security checklist

- OAuth **state** where required; **PKCE** if using libraries that expect it for public clients (web server flow often confidential client).
- **HTTPS** only in production; callback URLs exact-match app registration.
- **Turnstile** (optional, Cloudflare): protect email submit — [Protect your forms](https://developers.cloudflare.com/turnstile/tutorials/login-pages/).
- **CORS / cookie** domain alignment with `CLIENT_URL`.

### 3.8 Testing

- Integration tests for new routes (success, denied, inactive user, alias match).
- Regression: existing Google flow + dev-login unchanged when flags set.

### 3.9 Suggested implementation order (P0)

| Step | Deliverable |
|------|-------------|
| 1 | Env + validation rules for multi-provider; document Railway env vars in README snippet. |
| 2 | Extract shared **OAuth user resolver**; refactor Google strategy + MCP to use it (no behavior change). |
| 3 | Microsoft OAuth routes + strategy + callback; E2E manual test on Railway preview. |
| 4 | Email path (magic link **or** password — pick in §3.1) + Resend. |
| 5 | Client sign-in UI + i18n + error handling. |
| 6 | Optional: `UserIdentity` migration + data backfill from `googleId`. |

---

## 4. References (external)

- [Microsoft identity platform](https://learn.microsoft.com/en-us/azure/active-directory/develop/) — app registration, redirect URIs, tenant types.
- [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) — Sign-In with Ethereum (wallet P1).
- [WebAuthn](https://www.w3.org/TR/webauthn/) — passkeys (P1).
- [Sign in with Apple](https://developer.apple.com/sign-in-with-apple/) — IdP (P1).

---

## 5. Document history

- **2026-04:** Initial strategy + P0 plan (consolidates architecture discussion: providers, passkeys, Railway, multitenancy, matrix).
- **2026-04:** P0 implemented in code: shared `oauthUserService`, Google + Microsoft Passport routes, `User.microsoftId`, MCP still uses Google for browser OAuth; email magic link + `EmailLoginToken` + **Resend** (`RESEND_API_KEY`, `RESEND_FROM`); wireframe [AUTH_MAGIC_LINK_WIREFRAMES.svg](./designs/AUTH_MAGIC_LINK_WIREFRAMES.svg).

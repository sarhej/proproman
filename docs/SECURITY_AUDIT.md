# Security Audit Report

## Overview
This report summarizes the findings of a security audit performed on the codebase.

**Date:** March 9, 2026
**Scope:** Server Architecture, API, and Dependencies

## 1. Dependency Audit
- **Tool:** `npm audit`
- **Status:** ✅ Passed (0 vulnerabilities)
- **Fixes Applied:** Upgraded `vitest` and `vite` to latest versions in both client and server workspaces. Verified tests still pass.

## 2. Static Application Security Testing (SAST)
- **Tool:** Semgrep (v1.154.0)
- **Status:** ✅ Passed (0 findings)
- **Fixes Applied:**
    - **Dockerfile:** Updated to run as a non-root user (`nodejs`) instead of `root`. This mitigates container breakout risks.
    - **Server:** Added `helmet` for secure HTTP headers and `express-rate-limit` for basic DDoS protection.
- **Manual Review Findings & Fixes:**
    - **Input Validation:** Excellent use of `zod` for request body validation. Prevents mass assignment and injection attacks.
    - **Authentication:**
        - Google OAuth is correctly implemented.
        - `apiKeyAuth` middleware: **FIXED.** Updated to use `crypto.timingSafeEqual` to prevent timing attacks.
        - `dev-login` route: **FIXED.** Added a hard check for `NODE_ENV === "production"` to ensure it cannot be enabled in production even if the env var is set.
    - **Authorization:**
        - Role-Based Access Control (RBAC) is implemented (`requireRole`).
        - Resource-level authorization (`canUserEditInitiative`) is implemented for initiatives, preventing unauthorized modification.
    - **Session Management:**
        - `express-session` with Postgres store.
        - Cookies: `httpOnly: true`, `secure: production`, `sameSite: "lax"`.
    - **Database:**
        - Prisma ORM prevents SQL injection by default.

## 3. Remaining Recommendations
1.  **CSRF Protection:**
    - **Issue:** Relying solely on `sameSite: "lax"`.
    - **Recommendation:** Consider implementing Double Submit Cookie pattern or using a CSRF library if strictly state-changing requests are critical.

## 4. Pipeline & Automation
I have implemented a comprehensive security pipeline:

1.  **GitHub Actions Workflow (`.github/workflows/security.yml`):**
    -   **Dependency Audit:** Runs `npm run security:check` on every push/PR.
    -   **SAST (Semgrep):** Runs Semgrep scan on every push/PR.
    -   **Secret Scanning:** Runs `gitleaks` to detect committed secrets.
    -   **Schedule:** Runs weekly on Mondays.

2.  **Automated Updates (`.github/dependabot.yml`):**
    -   Configured Dependabot to check for updates weekly for `npm` (root, client, server) and GitHub Actions.

3.  **Pre-commit Hooks (`husky` + `lint-staged`):**
    -   **JS/TS Files:** Runs `eslint --fix` to catch issues early.
    -   **package.json:** Runs `npm run security:check` to prevent committing vulnerable dependencies.

## 5. Scripts Added
The following scripts have been added to `package.json`:
- `npm run audit`: Run dependency audit.
- `npm run audit:fix`: Fix dependencies (non-breaking).
- `npm run security:check`: Fail if high/critical vulnerabilities found.
- `npm run security:sast`: Run Semgrep scan (configured to use local user install).

## 6. Next Steps
1.  Push these changes to GitHub to enable the Actions.
2.  Consider adding CSRF protection if needed.

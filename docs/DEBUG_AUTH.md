# Auth debugging (Railway / server logs)

After deploying, reproduce the login flow and check **Railway → your service → Logs** (or Deployments → View logs). Look for these lines to see where the flow breaks.

## After you click "Continue with Google" and come back

1. **`[auth] Login OK redirecting`**  
   Means: Google strategy succeeded, `req.login` and `req.session.save()` succeeded, redirect is being sent.  
   If you **never** see this, the failure is earlier (strategy error or session save error).

2. **`[auth] Google callback error:`**  
   Strategy or DB error during login (e.g. Prisma, `logAudit`, user create/update).  
   Next line is the error message.

3. **`[auth] Session save after login:`** or **`[auth] Session persist after login:`**  
   `req.login` or `req.session.save()` failed.  
   Next line is the error message.

## When the app loads and calls GET /api/auth/me

4. **`[auth] GET /me 401`**  
   Server returned 401. The log line includes:
   - **`hasSession`** – was a session ID present for this request?
   - **`sessionId`** – first 8 chars of the session ID (if any).
   - **`cookie`** – `"present"` or `"missing"` (was the `Cookie` header sent?).

   How to read it:
   - **`cookie: "missing"`** → Browser is not sending the session cookie (wrong domain, SameSite, or wrong URL).
   - **`cookie: "present"` but `hasSession: false`** → Session ID from cookie not found in the store (e.g. session table missing or not written).
   - **`cookie: "present"` and `hasSession: true`** but still 401 → Session exists but `deserializeUser` failed or user not found (see below).

5. **`[auth] deserializeUser no user for id`**  
   Session had a user id but that user was not found in the DB (e.g. deleted user or wrong id).

6. **`[auth] deserializeUser error`**  
   Error while loading the user from DB (e.g. DB connection, schema).

## Typical outcomes

- **No "Login OK redirecting", no error line**  
  Request might not be reaching the callback (wrong URL, redirect to wrong place).

- **"Login OK redirecting" then "GET /me 401" with `cookie: "missing"`**  
  Cookie not sent: check app URL vs `CLIENT_URL`, SameSite, and that the app and API are the same origin (or CORS/credentials are correct).

- **"GET /me 401" with `cookie: "present"` and `hasSession: false`**  
  Session store (Postgres) didn’t have that session: e.g. session table missing, or session wasn’t saved before redirect (should be fixed with `req.session.save()` before redirect).

- **"deserializeUser no user for id"**  
  User was removed from DB or session has a stale user id.

Redeploy, try logging in once, then open the logs and search for `[auth]` to see the exact sequence.

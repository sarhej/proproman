# Phase 6 — External URL fetch for intake

**Hub:** Initiative `cmpblw2ha000bms0q127a8ueq` · Feature `cmpblwe4n000nms0qp55hm28h` · Req `cmumb4ib9000no90qdak7fisi`  
**Wireframe:** `docs/designs/AI_PRODUCT_INTAKE_URL_FETCH_WIREFRAMES.svg`  
**Schemas:** `docs/designs/AI_PRODUCT_INTAKE_PARSER_SCHEMAS.md` (§1 `urlFetches`, §2 REST)

Status: **PR open** — https://github.com/sarhej/proproman/pull/53 (D1–D9 confirmed 2026-09-29).

---

## 1. What this phase is for (plain language)

Phases 1–5 already let you type, paste text, upload files, plan, draft, and Create in hub.

Phase 6 adds: **paste a link → Tymio fetches content server-side → text joins the intake session** so Analyze / drafts can use it.

If fetch fails (private page, login wall, blocked host, timeout), you see a clear banner and **paste the content yourself** — intake never blocks.

---

## 2. Screens (user journey)

### Screen 1 — Capture with URL

**Job:** Paste or type a URL in the capture area (or a dedicated URL field). Detect → Fetch.

| UI element | Meaning |
|------------|---------|
| **URL chip / field** | Recognized `https://…` link from paste or typed URL row. |
| **Fetch** | Calls `POST /api/intake-sessions/:id/fetch-url`. Disabled while fetching. |
| **Fetching…** | In-progress state; non-blocking for other edits. |
| **Fetched (ok)** | Green chip: host label + short title; attachment appears in panel (`source: url_fetch`). |
| **Could not fetch** | Amber banner + reason; **Paste content instead** focuses raw text. |
| **Needs sign-in** | Provider detected but no tenant credentials; same paste fallback (no OAuth UI in v1). |

### Screen 2 — After successful fetch

**Job:** Confirm content is on the session before Analyze.

| UI element | Meaning |
|------------|---------|
| Attachment row | `fetched-<host>-….md` (or `.txt`) linked to session. |
| rawText merge | Optional: append a short “Source: \<url\>” stub + excerpt into `rawText` (see D3). |
| Analyze | Unchanged; planner/parsers already read `rawText` + attachments. |

### Screen 3 — Failure / unsupported

**Job:** Recover without dead ends.

| State | User sees |
|-------|-----------|
| Unsupported / blocked host | “This link type is not fetched automatically.” + paste fallback. |
| Timeout / 4xx/5xx | “Could not fetch (HTTP … / timeout).” + paste fallback. |
| Too large | “Content exceeds size limit.” + paste fallback. |
| SSRF / private IP | Silent reject as unsupported (no internal probe details in UI). |

---

## 3. Proposed user-facing copy (i18n)

| Key | Copy |
|-----|------|
| `intake.urlFieldLabel` | Link to fetch |
| `intake.urlFieldHint` | Paste a public https link. Private Notion / Docs / Jira / Slack need paste if we cannot sign in. |
| `intake.urlFetch` | Fetch link |
| `intake.urlFetching` | Fetching… |
| `intake.urlFetchOk` | Fetched from {{host}} |
| `intake.urlFetchFailed` | Could not fetch this link. Paste the content below instead. |
| `intake.urlFetchNeedsAuth` | This page needs sign-in. Paste the content below, or connect credentials later. |
| `intake.urlFetchUnsupported` | This link type is not fetched automatically. Paste the content instead. |
| `intake.urlFetchTooLarge` | Content is too large to fetch. Paste a shorter excerpt instead. |

---

## 4. Hub acceptance mapping

| AC | Phase 6 plan |
|----|----------------|
| 1. Detect + server fetch + tenant-safe credentials where configured | Detect hosts; **v1: public HTTP(S) only**. Credentialed Notion/GDocs/Jira/Slack = **explicit later slice** (D1). |
| 2. Failures → visible error + paste fallback | Banner + i18n; session continues. |
| 3. Fetched content as session artifact | Attachment + `AttachmentLink.intakeSessionId`; `sourceMeta.urlFetches[]`. |
| 4. Rate limits + size caps; PII policy documented | Per-tenant rate; max bytes; §8 policy note (no auto-redaction engine in v1). |
| 5. Parser gets normalized text + attachment refs | Append/merge into analyze input path already used by Phases 2–4. |

---

## 5. Scope decisions (please confirm)

| ID | Decision | Recommendation |
|----|----------|----------------|
| **D1** | Provider depth | **v1 = public URL fetch + host detection.** Label Notion/GDocs/Jira/Slack as “needs auth → paste” unless env credentials exist later. Do **not** build OAuth install UI in this PR. |
| **D2** | Endpoint | `POST /api/intake-sessions/:id/fetch-url` body `{ url: string }`. |
| **D3** | rawText vs attachment-only | **Both:** store full normalized text as Attachment; **append** a short source header + up to N chars into `rawText` so Analyze works without new attachment-text extractors. |
| **D4** | Auto-fetch on paste | **Yes** when pasted string is a single URL (or URL-only line); else user clicks Fetch. Debounce ~400ms. |
| **D5** | SSRF | Allow only `http:`/`https:`; block loopback, link-local, private RFC1918, metadata IPs; no redirects to blocked hosts; max redirect hops 3. |
| **D6** | Limits | Max response **1 MB** body; timeout **10s**; **10 fetches / session / hour** (tunable). |
| **D7** | HTML → text | Strip scripts/styles; prefer `text/plain` / markdown; else simple HTML→text (title + body text). PDF/binary: reject with “upload file instead”. |
| **D8** | Credentials (future) | Optional server env / tenant secrets keyed by provider; if missing → `needs_auth` status, not hard fail of intake. |
| **D9** | Out of scope | OCR; Slack Events adapter; browser extension; storing third-party OAuth tokens in this slice. |

---

## 6. API / data shape

### Request / response

```http
POST /api/intake-sessions/:id/fetch-url
{ "url": "https://example.com/spec" }

→ 200
{
  "urlFetch": {
    "url": "https://example.com/spec",
    "status": "ok",
    "provider": "generic" | "notion" | "google_docs" | "jira" | "slack" | "unknown",
    "httpStatus": 200,
    "fetchedAt": "…",
    "normalizedTextRef": "<attachmentId>",
    "error": null
  },
  "session": { /* same shape as GET */ }
}
```

Failure still returns **200 with `status: failed | skipped | needs_auth`** (or **400** for invalid URL) so UI can show paste fallback without treating it as a transport error. Abuse / auth on session → normal 401/403/429.

### `sourceMeta.urlFetches[]`

Matches parser schemas §1. Append each attempt (ok or failed).

### Analyze input

When building planner/parser context: `rawText` (already updated) + list attachment texts for `source: url_fetch` when available.

---

## 7. Implementation sketch (after approval)

1. `server/src/intake/urlFetch.ts` — detect provider, SSRF checks, fetch, normalize, limits.
2. Route on `intake-sessions.ts` + HTTP tests (mock `fetch`).
3. Persist Attachment via existing attachment storage + link to session; patch `sourceMeta` + optional `rawText`.
4. Client: URL field / paste detect in `ProductIntakeShell`; chips + banners; i18n.
5. Playwright: mocked `/fetch-url` success + failure paths.
6. Doc note in this file §8 (PII): fetched text is tenant-scoped like other attachments; operators should avoid pasting secrets into public URLs; no cross-tenant logging of body.

---

## 8. PII / abuse policy (v1)

- Fetched bodies stored as tenant Attachments (same ACL as uploads).
- Do not log full body to application logs; log URL host + status + byte length only.
- No automatic PII redaction in v1 (document as known gap; users control what they paste/fetch).
- Rate/size caps as D6.

---

## 9. Test cases (including edges)

| # | Case | Expect |
|---|------|--------|
| T1 | Valid public HTML URL | `ok`, attachment, `urlFetches` entry, rawText gains source stub |
| T2 | `text/plain` URL | `ok`, stored as `.txt` |
| T3 | 404 / 500 | `failed`, banner, no attachment (or empty), paste fallback |
| T4 | Timeout | `failed` timeout message |
| T5 | `http://127.0.0.1/…` | rejected / `skipped` (SSRF) |
| T6 | Redirect to private IP | rejected |
| T7 | Body > 1 MB | `failed` too large |
| T8 | Rate limit exceeded | 429 or `failed` rate |
| T9 | Notion URL without credentials | `needs_auth` + paste copy |
| T10 | Invalid URL string | 400 |
| T11 | Second fetch same URL | new audit entry (or replace — prefer append + latest wins in UI) |
| T12 | Analyze after fetch | planner sees merged text |
| T13 | UI paste single URL | auto-triggers fetch |
| T14 | UI fetch fail | banner + textarea focus / hint |
| T15 | Unauthenticated session | 401 |

---

## 10. Open for your call

Confirm **D1–D9** (especially D1 public-only and D3 rawText merge). After approval → implement on a feature branch + PR.

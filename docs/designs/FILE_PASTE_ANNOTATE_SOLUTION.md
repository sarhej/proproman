# File paste / upload / annotate — solution design

**Status:** NO IMPLEMENTATION YET — awaiting approval  
**Date:** 2026-07-16  
**Related:** `AI_PRODUCT_INTAKE_PARSER_SCHEMAS.md`, `AI_PRODUCT_INTAKE_WIREFRAMES.svg`  
**Wireframes:** `FILE_PASTE_ANNOTATE_WIREFRAMES.svg`  
**Reference studied:** `/Users/supersergio/projects/cursor-mobile` (patterns only)

---

## 0. Executive recommendation (read first)

Tymio today has **no binary attachment system**. Links (PR/Figma/URLs), plain-text notes/comments, and marketing `Asset.url` fields exist — not blob storage, not paste-of-screenshot, not markup.

**Recommended direction**

1. Build a **workspace Files / Artifacts library**: tenant-scoped `Attachment` rows + object storage. Files are **first-class objects** with controlled security — **not** owned by a single screen.
2. Screens **only create `AttachmentLink`s** (and capture/annotate UX). The same file can be **linked, unlinked, and reused** across Intake, Feature, Requirement, Initiative, Demand, and later any hub object.
3. Ship **shared capture UX** first on Intake + Feature/Requirement panels; add an **Admin → Artifacts** console for browse / search / retire / backup.
4. Treat **annotation as a short markup session that exports a flattened PNG** (plus keep original). Do **not** invent a full design tool.
5. Phase: **v0 library+store+attach → v1 annotate → v1.5 admin manage/retire → v2 backup + agent/MCP**.

**Do not** start with a global always-on paste overlay, a rich-text notes rewrite, or copying cursor-mobile’s in-memory base64 chat pipeline into the hub.

**Architecture mantra:** *Attachment is the artifact; screens only link to it.*

---

## 1. Research summary — what proproman / Tymio already has

### 1.1 File uploads / attachments / images

| Area | Reality |
|------|---------|
| Binary upload API | **None** — no `multer`, multipart routes, or presigned upload flow found |
| Prisma blob / file model | **None** for hub evidence |
| `Asset` | Marketing campaign asset metadata; optional **`url` string** (`AssetType`: landing page, banner, …) — not user file blobs |
| `WorkArtifactLink` | Typed **URL** to commit/PR/issue/etc. |
| `DesignArtifactLink` | Typed **URL** (Figma / generic / Claude design) |
| `Campaign` / leaflets | External URLs only |
| Avatars | OAuth `avatarUrl` remote URLs — not uploads |
| Export “attachment” | HTTP `Content-Disposition` for CSV/JSON download only |

**Backlog hint (not implemented):** DR Digital / initiative notes mention *“3.2 Document upload — new InitiativeDocument or S3; additive”* (`server/src/mcp/tools.ts`, populate scripts). That is a **product wish**, not code.

### 1.2 Paste / clipboard

| Usage | Purpose |
|-------|---------|
| `navigator.clipboard.writeText` | Copy workspace URL, MCP URL, share links |
| Tests for clipboard fallback | `client/src/lib/workspaceUrl.ts` |
| Image / file paste (`clipboardData`, `onPaste` file items) | **Absent** in product UI |

Clipboard today is **copy-out**, never **paste-in** of media.

### 1.3 Drag-drop

All `@dnd-kit` / drag usage is **entity reordering** (kanban cards, product tree, domain board). **No file drop zones.**

### 1.4 Notes / rich text / screenshots

| Surface | Format |
|---------|--------|
| `Initiative.notes`, feature/requirement descriptions | Plain `String` / textarea |
| `InitiativeComment` | Plain `text` only — no media |
| Wiki | Markdown **read** (`react-markdown`), not an editor for hub entities |
| Rich editors (TipTap / Lexical / Quill) | **Not** in hub entity forms |

No screenshot capture or markup UI exists.

### 1.5 Storage, MIME, size limits

| Layer | Finding |
|-------|---------|
| Object storage (S3 / R2 / MinIO) | **No** app integration / env conventions for user files |
| Atlas on disk | `WORKSPACE_ATLAS_DATA_DIR` — compiled JSON shards, **not** user uploads; ephemeral PaaS disks need a volume or rebuild |
| Express body | `express.json({ limit: "10mb" })` — JSON only; would not correctly serve multipart uploads |
| MIME allowlists | **None** for uploads (nothing to allowlist) |
| Privacy / ToS | Mentions uploads/attachments as possible personal data / abuse vector — anticipates capability, doesn’t define it |

**Implication:** any real attachment feature needs a **new storage choice** (R2 / S3 / Railway volume + local FS for small deployments) and **new authz** (tenant + membership on every byte).

### 1.6 Design docs & hub (intake / attachments)

**In-repo (authoritative for intended product):**

- `docs/designs/AI_PRODUCT_INTAKE_PARSER_SCHEMAS.md` — intake session already models:

```json
"attachments": [{
  "id": "string",
  "mimeType": "string",
  "filename": "string",
  "storageRef": "string",
  "source": "upload | paste | url_fetch"
}]
```

- Wireframes (`AI_PRODUCT_INTAKE_WIREFRAMES.svg`) panel B: *“Paste text, drop screenshot, or paste a Notion/Jira/Slack URL…”* + “+ Upload file”.
- Test matrix includes **“Single bug from screenshot paste”**.
- Hub initiative named in that doc: **AI-assisted product intake — Create Bug & Create Feature** (workspace `tymio`).

**Hub atlas at research time:** active MCP session was workspace `airchi` (no upload/intake hits). Workspace `tymio` hub MCP (`project-0-proproman-tymio-hub-remote`) required OAuth and **auth timed out** — could not re-verify live hub rows. Treat intake design docs + DR “document upload” notes as the known product intent until `tymio` MCP is re-authenticated.

### 1.7 Research verdict

Tymio is a **link-and-text hub**. AI Product Intake **already assumes** attachments with `storageRef` and paste/upload sources, but the **platform primitives are missing**. File paste + annotate is therefore an **infrastructure + UX** feature that should unlock intake (and later agents), not a one-off UI gadget.

---

## 2. cursor-mobile reference analysis

Source of truth for UX: `cursor-mobile/relay/src/static-assets.ts` (monolithic HTML/CSS/JS string).

### 2.1 How paste / drop / upload work

| Mechanism | Behavior |
|-----------|----------|
| **Paste** | Composer `paste` handler; takes first `clipboardData` item that is `image/png` or `image/jpeg`; `preventDefault`; `addAttachment(file)` |
| **File picker** | Hidden `<input type="file">` → `addAttachment` per file |
| **Drag-drop** | `dragover`/`drop` on chat surface; all dropped files through `addAttachment` |
| **Share target** | Service worker + IndexedDB drain into same attachment pipeline (PWA) |
| **Encoding** | `FileReader.readAsDataURL` → strip prefix → **base64 in memory** |
| **Limits** | `MAX_IMAGE_SIZE = 6 MiB`, `MAX_IMAGES = 4`; non-png/jpeg rejected |

Attachments are sent as **chat prompt parts** over WebSocket to a local agent — **ephemeral**, not a durable CMS.

### 2.2 Drawing / annotation

| Aspect | Implementation |
|--------|----------------|
| Library | **None** — raw `<canvas>` + 2D context |
| Tools | Pen, line, rect, circle, text (`prompt()`), eraser |
| Colors | White / black / red / blue / green |
| Undo/redo | Snapshot stack of `canvas.toDataURL()` (max 50) |
| Background | Dark fill `#1a1a2e`; optional imported image scaled to fit |
| Pointer | Pointer events; stylus pressure widens pen |
| Entry points | Composer “Draw”; preview **“Draw on it”** after opening an attached image |
| Export | `canvas.toBlob(..., "image/png")` → base64 → push into `attachments[]` → close panel |

**Data model:** none persistent. Markup is burned into PNG pixels before send.

### 2.3 Reusable inspiration vs wrong for Tymio

**Reuse as UX patterns**

- Paste image → thumbnail strip → open → **Draw on it** → confirm.
- Same pipeline for picker, drop, and paste.
- Small tool set (pen, rect, arrow/line, text) — enough to mark bugs.
- Hard MIME + size + count limits with silent/reject behavior (Tymio should surface toast errors).
- Flattened PNG as the artifact agents/humans both understand.

**Do not copy blindly**

| cursor-mobile | Why wrong for Tymio |
|---------------|---------------------|
| Base64 in client forever / WS payload | Hub needs durable, tenant-keyed storage + CDN/signed URLs |
| Destination = agent chat prompt | Destination = hub entity / intake session |
| Image-only png/jpeg | Hub will want PDF/docx later (v0 can still be image-first) |
| Dark “sketch pad” default | Markup should preserve screenshot fidelity (light UI, no forced dark matte unless empty canvas) |
| `prompt()` for text labels | Use inline text tool / modal consistent with Tymio design system |
| Raster undo history only | Fine for v1; if re-edit is a goal, store vector overlay separately |
| PWA share-target / relay PIN | Mobile-relay specific |
| Monolithic vanilla JS in one file | React component(s) + shared upload client |

### 2.4 Key files / patterns (cursor-mobile)

| Path | Notes |
|------|-------|
| `relay/src/static-assets.ts` ~1771–1772 | Size/count caps |
| ~4144–4174 | `addAttachmentFromFile` MIME/size/base64 |
| ~5412–5427 | Attach button + paste |
| ~5220–5226 | Drag-drop |
| ~4787–5045 | Draw canvas, tools, undo, `toBlob` attach |
| ~2502–2536 | Preview “Draw on it” |
| ~5011–5025 | `initDrawInPanel(imageDataUrl)` |

---

## 3. Problem / jobs-to-be-done

**Primary JTBD:** When a PM/PO/dev sees a UI problem (or customer evidence), they can **capture a screenshot, mark what is wrong, and attach it to the right hub object** in under a minute — without leaving Tymio or uploading to a third-party pastebin.

**Secondary**

- Intake: turn annotated screenshot + short text into a bug Feature (AI Product Intake).
- Agents: MCP/coding agents attach or read evidence when creating/updating requirements.
- Admins: browse the workspace artifact library, see where files are used, retire stale blobs, run backups.
- Audit: who attached what, when, on which tenant/entity; retire/restore history.

**Non-goals (v0–v1)**

- Full Figma competitor / whiteboard.
- Collaborative real-time multiplayer markup.
- Replacing DesignArtifactLink / WorkArtifactLink URL model (those stay URL metadata; binaries are a separate library).
- Email inbound attachments.
- Cross-workspace file sharing (each tenant’s library is isolated).

---

## 4. Ideal UX flows

### 4.1 Happy path A — paste → annotate → attach (bug evidence)

1. User is on **Product → Create Bug** (intake) **or** Feature/Requirement detail.
2. User presses ⌘V / Ctrl+V with a screenshot on the clipboard (or drops a PNG into the dropzone).
3. **Capture sheet** opens: thumbnail, filename, size; actions **Annotate**, **Attach as-is**, **Cancel**.
4. Annotate: fullscreen/desktop modal with image + tools (pen, arrow, rect, text); Undo; **Save annotated**.
5. System stores **original** + **annotated** (or original + overlay — see §6); shows chip in intake / entity attachments.
6. User adds one sentence (“Login button clipped on mobile”) → Continue / Save.
7. (Later AI) Vision model uses annotated image to prefill bug draft fields.

### 4.2 Happy path B — requirement already exists

1. Open Requirement → Attachments → Upload / paste.
2. Annotate optional.
3. Attachment listed with preview; download via signed URL.

### 4.3 Happy path C — agent evidence (v2)

1. Agent calls `tymio_create_attachment` (presign or multipart) then `tymio_link_attachment` to feature/requirement.
2. Or agent receives attachment ids from intake session and cites them in requirement description.

### 4.4 Happy path D — reuse existing artifact

1. On Requirement → Attachments → **Link from library** (picker).
2. Search/filter workspace artifacts (name, MIME, uploader, date).
3. Select existing `Attachment` → creates new `AttachmentLink` only (no second blob upload).
4. Same file appears on multiple entities; usage count visible in Admin.

### 4.5 Happy path E — admin manage / retire / backup

1. Admin opens **Admin → Artifacts** (workspace-scoped).
2. Table: filename, kind, size, uploader, created, **linked to N objects**, status (ACTIVE / RETIRED).
3. Row actions: Preview, Open links, Download, **Retire**, Restore (if retired), Delete permanently (gated).
4. Bulk: Retire unused (>N days, 0 links), Export backup manifest, Trigger backup job.
5. Backup produces a tenant-scoped archive + manifest (see §7.5); restore is a separate admin flow (v2+).

### 4.6 Edge cases

| Case | Behavior |
|------|----------|
| Paste while caret in textarea | Prefer **text paste**; if clipboard has **image item**, show small chooser: “Paste text” vs “Attach image” (default image when only image present) |
| Oversized file | Reject with max size message; suggest compression |
| Unsupported MIME | Reject with allowlist message |
| Annotate cancel | Keep pending original or discard — prefer keep pending until user closes capture sheet |
| Offline | Queue not required for v0; fail clearly |

---

## 5. Where in Tymio UI this should live

### Options (brainstorm)

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. AI Product Intake capture** (already wireframed) | Matches JTBD; schemas already have attachments | Intake not shipped yet | **Primary home for v0 UI** |
| **B. Feature / Requirement detail — Attachments panel** | Durable evidence next to work | Needs entity UI chrome | **Must-have companion** |
| **C. Initiative comments / notes** | Familiar | Comments are plain text; rich notes rewrite is large | **Defer** — link attachments, don’t embed blobs in comment text |
| **D. Demand / signals** | Good for customer evidence | Demand model is text-only today | **v1.5+** |
| **E. Global paste overlay (app shell)** | Magical ⌘V anywhere | Fights text editing; surprising; hard to pick target entity | **Optional later**, gated: only when clipboard is image **and** focus not in editable field **and** user has a clear “current entity” context |
| **F. Chat / messaging** | Soft for agents | Tymio is not a chat product | **No** as primary |
| **G. Admin → Artifacts library** | Browse/search/retire/backup; usage across objects | Needs ADMIN (or EDITOR+) RBAC | **Required platform surface** — not optional |
| **H. “Link from library” picker** on entity panels | Enables reuse without re-upload | Needs searchable library UX | **v0.5 / with Admin list** |

**Recommendation**

1. **Platform:** `Attachment` library + `AttachmentLink` + object storage + Admin Artifacts console.
2. **Capture UX:** shared `AttachmentCapture` + `ImageAnnotator` used first by **Intake (A)** and **Feature/Requirement (B)**; entity panels also get **Link from library (H)**.
3. Skip global overlay (E) until A+B+G feel native. Prefer **context-bound paste** on intake modal and attachment panels.

---

## 6. Annotation model

### 6.1 Tools (v1)

Minimum: **pen**, **arrow**, **rectangle**, **text label**, **undo/redo**, **clear markup**.  
Colors: high-contrast red + yellow + black (bug markup convention). Skip circle/eraser unless cheap.

### 6.2 Storage strategies

| Strategy | Pros | Cons |
|----------|------|------|
| **Flattened annotated PNG only** | Simple for humans + vision models; matches cursor-mobile | Loses original; re-edit hard |
| **Original + flattened annotated** | Best of both; cheap | 2× storage |
| **Original + vector overlay JSON** | Re-editable; smaller | Agents need render step; more UI complexity |
| **Original + overlay + optional bake on demand** | Ideal long-term | Overbuilt for v1 |

**Recommendation:** **v1 = original bytes + baked annotated PNG** (two `Attachment` rows or one row with `variants`). Defer editable vector overlay to v2 if users ask to re-edit.

### 6.3 Implementation approach (when coding — not now)

| Approach | Notes |
|----------|-------|
| Custom canvas (cursor-mobile style) | Small, no dependency; more bugs on HiDPI/touch |
| **tldraw / Excalidraw embed** (image as page) | Faster polish; heavier; licensing/bundle check required |
| Fabric.js | Middle ground |

**Critical take:** Prefer a **thin wrapper** around a maintained lib for desktop markup quality **unless** bundle size is a hard constraint — reinventing arrows/text hit-testing is false savings. Export path must still produce PNG.

---

## 7. Storage & security

### 7.0 Product model (universal library)

```text
┌─────────────────────────────────────────────────────────────┐
│  Workspace Artifacts Library (tenant-scoped)                │
│  Attachment = durable blob + metadata + lifecycle           │
└─────────────────────────────────────────────────────────────┘
         ▲ link / unlink (many)
         │
    AttachmentLink ──► Feature | Requirement | Initiative
                       Demand | IntakeSession | (future entities)
         │
    Screens only: capture, annotate, pick-from-library, list-on-entity
    Admin only:   browse all, retire, backup, hard-delete, quotas
```

- **One blob, many links.** Uploading twice for two requirements is wrong UX; pick from library or duplicate-link.
- **Unlink ≠ delete.** Removing a file from a Requirement drops the `AttachmentLink`; the `Attachment` stays until retired/purged.
- **Lifecycle is on the Attachment**, not on each screen.

### 7.1 Proposed data model (design only)

```text
Attachment {
  id, tenantId, createdByUserId
  filename, mimeType, byteSize, checksum
  storageKey          // object key, never raw public path only
  source              // UPLOAD | PASTE | AGENT | URL_FETCH | BACKUP_RESTORE
  kind                // ORIGINAL | ANNOTATED | DERIVATIVE
  parentAttachmentId? // annotated → original
  status              // ACTIVE | RETIRED | PURGED
  retiredAt?, retiredByUserId?, retireReason?
  createdAt, updatedAt
}

AttachmentLink {
  id, tenantId, attachmentId
  // exactly one target per link row (extend as needed):
  featureId? | requirementId? | initiativeId? | demandId? | intakeSessionId?
  role                // EVIDENCE | DESCRIPTION | OTHER
  createdByUserId, createdAt
}

AttachmentBackupJob {   // admin / ops
  id, tenantId, createdByUserId
  status              // PENDING | RUNNING | SUCCEEDED | FAILED
  manifestStorageKey? // JSON: attachment ids, checksums, link snapshot
  archiveStorageKey?  // optional zip/tar of blobs (or pointer to object-store dump)
  filterJson?         // e.g. { status: ACTIVE, before: ... }
  byteSize?, error?, startedAt?, finishedAt?
}
```

Do **not** overload `WorkArtifactLink` / `DesignArtifactLink` / marketing `Asset`.

### 7.2 Object storage

| Option | Fit |
|--------|-----|
| **Cloudflare R2** | Strong if already on CF; S3 API; cheap egress |
| **S3 / compatible** | Universal |
| **Railway volume + local FS** | OK for single-tenant/dev; weak for multi-region and signed CDN |

**Recommend:** S3-compatible (R2 or S3) with keys:

`tenants/{tenantId}/attachments/{yyyy}/{mm}/{attachmentId}/{filename}`

Backup artifacts (manifests / archives) under a sibling prefix:

`tenants/{tenantId}/attachment-backups/{jobId}/...`

### 7.3 AuthZ & safety

- All APIs under existing tenant resolver + membership.
- **Read (preview/download ACTIVE):** MEMBER+ (or VIEWER — **decide with user**).
- **Upload / link / annotate:** EDITOR+.
- **Admin library, retire, restore, backup, hard-delete:** ADMIN+ (SUPER_ADMIN for purge-all / cross-tenant never).
- **Presigned PUT** (preferred) or authenticated multipart via API; never anonymous upload.
- **Signed GET** with short TTL for previews; no permanent public URLs by default.
- Retired attachments: metadata visible to ADMIN; downloads only via admin restore or explicit “download retired” (audit-logged).
- Allowlist MIME v0: `image/png`, `image/jpeg`, `image/webp` (+ `image/gif` optional).
- Caps (starting point): **10 MiB / file**, **10 links / entity**, **20 / intake session**, soft **quota per tenant** (visible in Admin).
- Virus scanning: optional later; block executables by MIME + extension.
- Strip EXIF GPS on server when feasible (privacy).

### 7.4 Lifecycle: retire vs delete vs backup

| Action | Who | Effect |
|--------|-----|--------|
| **Unlink** | EDITOR+ | Removes `AttachmentLink` only; blob remains ACTIVE |
| **Retire** | ADMIN+ | `status=RETIRED`; hide from normal pickers; keep blob + metadata; links may stay read-only or warn |
| **Restore** | ADMIN+ | `status=ACTIVE` again |
| **Hard delete / purge** | ADMIN+ (confirm + optional grace) | Delete object storage key + DB row (or `PURGED` tombstone); **blocked** if policy requires backup first |
| **Backup** | ADMIN+ | Job writes **manifest** (ids, checksums, link graph) ± **archive** of blob bytes to backup prefix or export URL |
| **Scheduled backup** | Ops / ADMIN setting | Nightly/weekly job for ACTIVE (+ optional RETIRED); retention of backup jobs themselves |

**Critical product rule:** Retire is the default “get this out of people’s way”; hard delete is rare and auditable. Backups are **tenant-admin capability**, not only operator SSH.

### 7.5 What not to do

- Store base64 in Postgres `Text` columns.
- Serve files from atlas data dir.
- Trust client-provided MIME without sniffing.
- Cascade-delete blobs when unlinking from one entity.
- Allow hard delete without ADMIN + confirmation (and ideally a prior backup or retire grace period).

---

## 8. API / MCP implications (later)

### 8.1 REST (sketch)

- `POST /api/attachments/presign` → `{ uploadUrl, attachmentId, storageKey }`
- `POST /api/attachments/:id/complete` → validate size/MIME/checksum, mark ready
- `POST /api/attachments/:id/annotate` → upload baked PNG or accept second presign
- `POST /api/attachment-links` → link existing attachment to feature/requirement/…
- `DELETE /api/attachment-links/:id` → unlink only
- `GET /api/attachments/:id` → metadata + short-lived download URL
- `GET /api/attachments` → library list (filters: q, status, mime, uploader, unused)
- `POST /api/attachments/:id/retire` / `POST …/restore` (ADMIN+)
- `DELETE /api/attachments/:id` → hard delete / purge (ADMIN+, confirm)
- `POST /api/attachment-backups` → start backup job; `GET /api/attachment-backups/:id` → status + download manifest/archive URLs

### 8.2 MCP (v2)

- `tymio_create_attachment` / `tymio_list_attachments` / `tymio_link_attachment` / `tymio_unlink_attachment`
- Admin-oriented later: `tymio_retire_attachment` (role-gated)
- Agents should pass **attachment ids**, not megabyte base64 in tool args.
- Intake planner already references `attachments: ["attachment-id"]` — align MCP with that.

### 8.3 Vision / AI intake

Annotated PNG is the default model input (arrows/rects visible). Keep original for forensic “what did UI actually look like.”

---

## 9. Alternatives & trade-offs

| Alternative | Why reject / defer |
|-------------|--------------------|
| URL-only (imgur / Drive links) | Breaks tenant isolation, retention, agent reliability |
| Embed images as Markdown data-URLs in notes | DB bloat; no ACL; no annotate UX |
| Per-entity file ownership (no library) | Blocks reuse; admin/backup nightmare |
| Global paste overlay first | High surprise cost; wrong target selection |
| Vector-only markup without bake | Agents and email forwards suffer |
| Full rich-text editor project | Scope explosion; not required for JTBD |
| cursor-mobile copy-paste of canvas code | Wrong stack, storage, and destination |
| Hard-delete as only “remove” action | Too destructive; need retire + backup |

**Optimal path:** workspace Attachment library + AttachmentLink + Admin manage/retire/backup + shared capture/annotate on entity surfaces + flattened PNG for AI.

---

## 10. Phased rollout

| Phase | Scope | Exit criteria |
|-------|--------|----------------|
| **v0** | Object storage + `Attachment`/`AttachmentLink` + upload/paste/drop (images) + Feature/Requirement panel + Intake hooks + **Link from library** (basic) | Paste onto requirement; same file linkable elsewhere |
| **v0.5** | **Admin → Artifacts** list/search/preview/usage count + unlink from admin + retire/restore | Admin can find and retire unused files |
| **v1** | Annotator modal; store original + annotated; intake “screenshot paste” path | User marks a bug on screenshot before save |
| **v1.1** | Demand/initiative links; EXIF strip; mobile layout; quota meter in Admin | Evidence on signals; visibility of storage use |
| **v2** | **Backup jobs** (manifest ± archive) + MCP tools + agent upload + vision intake | Admin can export; agents attach by id |
| **v3** | Scheduled backups, purge policies, PDF, virus scan, editable overlay | Enterprise-ready |

**Explicit:** **NO IMPLEMENTATION YET — awaiting approval** of this design (library-first model, admin surfaces, storage vendor, annotate bake strategy, RBAC).

---

## 11. Open questions for the user

1. **Primary capture home for v0:** Intake-only first, or Feature/Requirement attachments first (or both in one PR)?
2. **Object storage:** R2 vs S3 vs Railway volume for MVP — any existing vendor preference / account?
3. **RBAC:** Can VIEWER download ACTIVE files? Upload = EDITOR+? Admin library/retire/backup = ADMIN+ only (recommended)?
4. **Annotation persistence:** Confirm **original + baked PNG** for v1 (vs vector overlay)?
5. **Global ⌘V overlay:** defer (recommended) or want magic paste in v1?
6. **Non-image files in v0:** images only, or also PDF?
7. **Retire grace:** soft retire only until v2 backup exists, or allow hard delete in v0.5 with double confirm?
8. **Backup format:** manifest-only first (cheap) vs full blob archive in first backup ship?
9. **Nav placement:** Admin → Artifacts under existing Admin menu — OK?
10. **Hub:** create/refine a Feature+Requirements under the AI Product Intake initiative once design is approved?

---

## 12. Suggested implementation notes (post-approval only)

- Client: `AttachmentCaptureProvider`, `ImageAnnotatorDialog`, `AttachmentList`, `AttachmentLibraryPicker`, **`AdminArtifactsPage`** (table + retire/backup drawers).
- Server: `attachments` + `attachment-links` + `attachment-backups` routers; storage adapter (`put`, `presignGet`, `delete`); prisma models; tenant middleware; audit log on retire/purge/backup.
- Align intake session schema `storageRef` with real `attachmentId` / `storageKey`.
- Tests: MIME reject, tenant isolation, signed URL expiry, annotate produces second object, unlink does not delete blob, retire hides from picker, backup manifest checksums.
- Do **not** change `.env` templates / package.json until storage vendor is chosen and approved.

---

## Appendix A — Gap matrix

| Capability | Today | Needed |
|------------|-------|--------|
| Paste image | No | Yes (context-bound) |
| Drag-drop files | No | Yes |
| File picker upload | No | Yes |
| Annotate screenshot | No | Yes (v1) |
| Durable blob store | No | Yes |
| Workspace artifact library | No | Yes (first-class Attachment) |
| Reuse across objects | No | Yes (AttachmentLink many) |
| Admin manage / retire | No | Yes (v0.5) |
| Backup / export | No | Yes (v2) |
| Attach to Feature/Requirement | Links only | Binary AttachmentLink |
| Intake attachments | Schema only | Implement with real storage |
| MCP attach | No | v2 |
| Clipboard copy text | Yes | Keep |

## Appendix B — Alignment with AI Product Intake

Intake already specifies paste/upload and `storageRef`. This feature is the **missing substrate**. Annotate should be a **step between capture and “Continue”** in panel B of `AI_PRODUCT_INTAKE_WIREFRAMES.svg`, not a separate product silo. Intake sessions **link** into the same workspace library as everything else.

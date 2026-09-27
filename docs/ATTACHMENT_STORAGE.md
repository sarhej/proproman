# Attachment object storage (ops)

Production attachments are durable private blobs. Browsers never talk to R2 directly.

## Drivers

| `ATTACHMENT_STORAGE_DRIVER` | Use |
|-----------------------------|-----|
| `local` | Dev / single-node. Files under `ATTACHMENT_STORAGE_DIR` (default `server/data/attachments`). |
| `s3` | S3-compatible (R2/MinIO) with access keys (`ATTACHMENT_S3_*`). |
| `worker` | **Production.** Cloudflare Worker + R2 binding. Railway holds only `ATTACHMENT_WORKER_URL` + `ATTACHMENT_WORKER_SECRET`. |

## Production (tymio.app)

| Piece | Value |
|-------|--------|
| Driver | `worker` |
| Worker | `tymio-attachments` → `https://tymio-attachments.sarhej.workers.dev` |
| Source | `workers/tymio-attachments/` |
| R2 bucket | `tymio-attachments-prod` (private; no r2.dev public URL) |
| Railway secrets | `ATTACHMENT_WORKER_URL`, `ATTACHMENT_WORKER_SECRET` (must match Worker `SHARED_SECRET`) |

### Worker API

- `GET /health` — public liveness
- `PUT|GET|DELETE /v1/object?key=…` — Bearer `SHARED_SECRET` required
- Keys must match `tenants/{tenantId}/attachments/…` (path traversal rejected)

### App behavior

- Upload/download/purge go through Tymio `/api/attachments` (or `/t/:workspaceSlug/api/attachments`) after session/API auth.
- Storage keys: `tenants/{tenantId}/attachments/{yyyy}/{mm}/{attachmentId}/{filename}`
- Server wraps every driver with `assertAttachmentStorageKey` (tenant prefix).
- Worker signed-URL methods return `null` — Phase 1 is API-proxied only.

### Deploy Worker

```bash
cd workers/tymio-attachments
npm install --legacy-peer-deps
printf '%s' "$SHARED_SECRET" | npx wrangler secret put SHARED_SECRET
npx wrangler deploy
```

Then set Railway `ATTACHMENT_STORAGE_DRIVER=worker` and the URL/secret **after** the app build that understands the `worker` enum is live.

### Security notes

- Isolation is **app/DB tenant checks + key prefix**, not R2 ACLs per tenant.
- Do not enable public bucket access or long-lived browser credentials.
- Rotate `SHARED_SECRET` / `ATTACHMENT_WORKER_SECRET` together.
- Optional later: Cloudflare WAF / rate limits on the Worker hostname.

### Migration note

Blobs uploaded while production used `local` are not in R2. New uploads go to R2; migrate old keys only if needed.

## Code map

- `server/src/attachments/storageFactory.ts` — driver selection + prefix guard
- `server/src/attachments/workerStorage.ts` — Worker client
- `server/src/attachments/s3Storage.ts` / `localStorage.ts`
- `server/src/attachments/constants.ts` — `buildAttachmentStorageKey`, `assertAttachmentStorageKey`
- `workers/tymio-attachments/src/index.ts` — R2 proxy

## Related design

`docs/designs/FILE_PASTE_ANNOTATE_SOLUTION.md`

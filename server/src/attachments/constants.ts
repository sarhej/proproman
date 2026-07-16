import { createHash } from "node:crypto";

/** v0 allowlist — images only. */
export const ATTACHMENT_ALLOWED_MIME: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

export const ATTACHMENT_MAX_LINKS_PER_ENTITY = 10;

/** Magic-byte sniff for allowlisted image types. */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return base.slice(0, 180);
}

export function buildAttachmentStorageKey(
  tenantId: string,
  attachmentId: string,
  filename: string,
  now = new Date()
): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `tenants/${tenantId}/attachments/${yyyy}/${mm}/${attachmentId}/${sanitizeFilename(filename)}`;
}

export function buildBackupManifestKey(tenantId: string, jobId: string): string {
  return `tenants/${tenantId}/attachment-backups/${jobId}/manifest.json`;
}

export type AttachmentValidationError =
  | { code: "MIME_REJECTED"; message: string }
  | { code: "SIZE_REJECTED"; message: string }
  | { code: "EMPTY"; message: string };

export function validateAttachmentBytes(
  buf: Buffer,
  claimedMime?: string | null
): { ok: true; mimeType: string } | { ok: false; error: AttachmentValidationError } {
  if (!buf.length) {
    return { ok: false, error: { code: "EMPTY", message: "File is empty" } };
  }
  if (buf.length > ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: {
        code: "SIZE_REJECTED",
        message: `File exceeds maximum size of ${ATTACHMENT_MAX_BYTES} bytes`
      }
    };
  }
  const sniffed = sniffImageMime(buf);
  if (!sniffed || !ATTACHMENT_ALLOWED_MIME.has(sniffed)) {
    return {
      ok: false,
      error: {
        code: "MIME_REJECTED",
        message: "Only PNG, JPEG, and WebP images are allowed"
      }
    };
  }
  if (claimedMime && claimedMime !== sniffed && !(claimedMime === "image/jpg" && sniffed === "image/jpeg")) {
    // Prefer sniffed type; soft mismatch is ok if claimed is also allowlisted alias
    if (!ATTACHMENT_ALLOWED_MIME.has(claimedMime as "image/png")) {
      return {
        ok: false,
        error: {
          code: "MIME_REJECTED",
          message: "Claimed MIME type is not allowed"
        }
      };
    }
  }
  return { ok: true, mimeType: sniffed };
}

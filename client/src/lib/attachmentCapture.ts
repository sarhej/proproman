/** Client-side attachment capture limits (mirrors server v0). */
export const CLIENT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CLIENT_ATTACHMENT_ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export type CaptureRejectReason = "MIME_REJECTED" | "SIZE_REJECTED" | "EMPTY";

export function validateClientImageFile(
  file: File
): { ok: true } | { ok: false; reason: CaptureRejectReason; message: string } {
  if (!file || file.size === 0) {
    return { ok: false, reason: "EMPTY", message: "File is empty" };
  }
  if (file.size > CLIENT_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: "SIZE_REJECTED",
      message: "File exceeds 10 MiB limit"
    };
  }
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!CLIENT_ATTACHMENT_ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      reason: "MIME_REJECTED",
      message: "Only PNG, JPEG, and WebP images are allowed"
    };
  }
  return { ok: true };
}

/** Extract first image File from a ClipboardEvent or DataTransfer. */
export function imageFileFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) {
      if (CLIENT_ATTACHMENT_ALLOWED_MIME.has(f.type) || f.type === "image/jpg") return f;
    }
  }
  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  return null;
}

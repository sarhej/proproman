import { createHash } from "node:crypto";

/** Image MIME types (v0). */
export const ATTACHMENT_IMAGE_MIME: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

/** Audio MIME types for voice capture (v1). */
export const ATTACHMENT_AUDIO_MIME: ReadonlySet<string> = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/flac"
]);

/** Transcript text from STT pipeline. */
export const ATTACHMENT_TRANSCRIPT_MIME: ReadonlySet<string> = new Set(["text/plain"]);

export const ATTACHMENT_ALLOWED_MIME: ReadonlySet<string> = new Set([
  ...ATTACHMENT_IMAGE_MIME,
  ...ATTACHMENT_AUDIO_MIME,
  ...ATTACHMENT_TRANSCRIPT_MIME
]);

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB (images / default)
/** Whisper API hard cap is 25 MiB. */
export const ATTACHMENT_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

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

/** Best-effort audio sniff; returns canonical mime or null. */
export function sniffAudioMime(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "audio/webm";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "audio/wav";
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS") {
    return "audio/ogg";
  }
  if (buf.length >= 3 && buf.toString("ascii", 0, 3) === "ID3") {
    return "audio/mpeg";
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") {
    return "audio/mp4";
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "fLaC") {
    return "audio/flac";
  }
  return null;
}

export function normalizeClaimedAudioMime(claimed?: string | null): string | null {
  if (!claimed) return null;
  const c = claimed === "audio/wave" || claimed === "audio/x-wav" ? "audio/wav" : claimed;
  const mp3 = c === "audio/mp3" ? "audio/mpeg" : c;
  return ATTACHMENT_AUDIO_MIME.has(mp3) || ATTACHMENT_AUDIO_MIME.has(c) ? mp3 : null;
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

/** Parse tenant id from `tenants/<tenantId>/attachments/...` (for backfill / repair). */
export function tenantIdFromAttachmentStorageKey(key: string): string | null {
  const m = /^tenants\/([^/]+)\/attachments\//.exec(key);
  return m?.[1] ?? null;
}

export function buildBackupManifestKey(tenantId: string, jobId: string): string {
  return `tenants/${tenantId}/attachment-backups/${jobId}/manifest.json`;
}

export type AttachmentValidationError =
  | { code: "MIME_REJECTED"; message: string }
  | { code: "SIZE_REJECTED"; message: string }
  | { code: "EMPTY"; message: string };

export type AttachmentValidateOptions = {
  /** Prefer audio path (higher size limit, audio sniff). */
  expectAudio?: boolean;
  /** Allow text/plain transcripts (STT DERIVATIVE). */
  expectTranscript?: boolean;
};

/**
 * Validate upload bytes. Images require magic sniff.
 * Audio: sniff when possible; else accept normalized claimed allowlisted MIME (browser MediaRecorder).
 * Transcript: UTF-8 text/plain only when expectTranscript.
 */
export function validateAttachmentBytes(
  buf: Buffer,
  claimedMime?: string | null,
  options?: AttachmentValidateOptions
): { ok: true; mimeType: string } | { ok: false; error: AttachmentValidationError } {
  if (!buf.length) {
    return { ok: false, error: { code: "EMPTY", message: "File is empty" } };
  }

  if (options?.expectTranscript || claimedMime === "text/plain") {
    if (buf.length > ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        error: {
          code: "SIZE_REJECTED",
          message: `File exceeds maximum size of ${ATTACHMENT_MAX_BYTES} bytes`
        }
      };
    }
    if (claimedMime && claimedMime !== "text/plain") {
      return {
        ok: false,
        error: { code: "MIME_REJECTED", message: "Transcript must be text/plain" }
      };
    }
    return { ok: true, mimeType: "text/plain" };
  }

  const imageSniff = sniffImageMime(buf);
  if (imageSniff && ATTACHMENT_IMAGE_MIME.has(imageSniff)) {
    if (buf.length > ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        error: {
          code: "SIZE_REJECTED",
          message: `File exceeds maximum size of ${ATTACHMENT_MAX_BYTES} bytes`
        }
      };
    }
    return { ok: true, mimeType: imageSniff };
  }

  const audioSniff = sniffAudioMime(buf);
  const claimedAudio = normalizeClaimedAudioMime(claimedMime);
  const audioMime = audioSniff ?? (options?.expectAudio || claimedAudio ? claimedAudio : null);
  if (audioMime && ATTACHMENT_AUDIO_MIME.has(audioMime)) {
    if (buf.length > ATTACHMENT_AUDIO_MAX_BYTES) {
      return {
        ok: false,
        error: {
          code: "SIZE_REJECTED",
          message: `Audio exceeds maximum size of ${ATTACHMENT_AUDIO_MAX_BYTES} bytes`
        }
      };
    }
    return { ok: true, mimeType: audioMime === "audio/mp3" ? "audio/mpeg" : audioMime };
  }

  return {
    ok: false,
    error: {
      code: "MIME_REJECTED",
      message: "Only PNG, JPEG, WebP images; WebM/WAV/MP3/MP4/OGG audio; or text/plain transcripts are allowed"
    }
  };
}

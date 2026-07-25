import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_AUDIO_MAX_BYTES,
  buildAttachmentStorageKey,
  sanitizeFilename,
  sha256Hex,
  sniffAudioMime,
  sniffImageMime,
  tenantIdFromAttachmentStorageKey,
  validateAttachmentBytes
} from "./constants.js";
import { LocalAttachmentStorage } from "./localStorage.js";

/** Minimal valid 1x1 PNG */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Minimal EBML/WebM-looking header */
const WEBM_HDR = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

describe("attachment constants", () => {
  it("sniffs png/jpeg/webp", () => {
    expect(sniffImageMime(PNG_1X1)).toBe("image/png");
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    expect(sniffImageMime(webp)).toBe("image/webp");
    expect(sniffImageMime(Buffer.from("not-an-image"))).toBeNull();
  });

  it("sniffs webm/wav audio", () => {
    expect(sniffAudioMime(WEBM_HDR)).toBe("audio/webm");
    const wav = Buffer.alloc(12);
    wav.write("RIFF", 0);
    wav.write("WAVE", 8);
    expect(sniffAudioMime(wav)).toBe("audio/wav");
  });

  it("rejects oversized and bad mime", () => {
    const ok = validateAttachmentBytes(PNG_1X1, "image/png");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.mimeType).toBe("image/png");

    const bad = validateAttachmentBytes(Buffer.from("%PDF-1.4"), "application/pdf");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("MIME_REJECTED");

    const huge = Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 0xff);
    huge[0] = 0x89;
    huge[1] = 0x50;
    huge[2] = 0x4e;
    huge[3] = 0x47;
    const size = validateAttachmentBytes(huge);
    expect(size.ok).toBe(false);
    if (!size.ok) expect(size.error.code).toBe("SIZE_REJECTED");
  });

  it("accepts audio webm and transcript text", () => {
    const audio = validateAttachmentBytes(WEBM_HDR, "audio/webm", { expectAudio: true });
    expect(audio.ok).toBe(true);
    if (audio.ok) expect(audio.mimeType).toBe("audio/webm");

    const txt = validateAttachmentBytes(Buffer.from("hello", "utf8"), "text/plain", {
      expectTranscript: true
    });
    expect(txt.ok).toBe(true);
    if (txt.ok) expect(txt.mimeType).toBe("text/plain");

    expect(ATTACHMENT_AUDIO_MAX_BYTES).toBeGreaterThanOrEqual(ATTACHMENT_MAX_BYTES);
  });

  it("builds safe storage keys and checksums", () => {
    expect(sanitizeFilename("../evil.png")).toBe(".._evil.png");
    const key = buildAttachmentStorageKey("t1", "a1", "shot.png", new Date("2026-07-16T00:00:00Z"));
    expect(key).toBe("tenants/t1/attachments/2026/07/a1/shot.png");
    expect(tenantIdFromAttachmentStorageKey(key)).toBe("t1");
    expect(tenantIdFromAttachmentStorageKey("pending")).toBeNull();
    expect(sha256Hex(PNG_1X1)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("LocalAttachmentStorage", () => {
  let root: string;
  let storage: LocalAttachmentStorage;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "att-"));
    storage = new LocalAttachmentStorage(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("puts, gets, and deletes objects", async () => {
    const key = "tenants/t1/attachments/2026/07/a1/x.png";
    await storage.put(key, PNG_1X1, "image/png");
    const got = await storage.get(key);
    expect(got.equals(PNG_1X1)).toBe(true);
    expect(await storage.getSignedDownloadUrl(key, 60)).toBeNull();
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("rejects path traversal keys", async () => {
    await expect(storage.put("../escape.png", PNG_1X1, "image/png")).rejects.toThrow();
  });
});

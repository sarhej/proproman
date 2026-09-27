import { env } from "../env.js";
import { assertAttachmentStorageKey } from "./constants.js";
import { LocalAttachmentStorage, defaultAttachmentStorageDir } from "./localStorage.js";
import { S3AttachmentStorage } from "./s3Storage.js";
import type { AttachmentStorage } from "./storage.js";
import { WorkerAttachmentStorage } from "./workerStorage.js";

let cached: AttachmentStorage | null = null;

/** Defense-in-depth: refuse ops on keys outside tenants/{id}/attachments/. */
class PrefixedAttachmentStorage implements AttachmentStorage {
  constructor(private readonly inner: AttachmentStorage) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertAttachmentStorageKey(key);
    return this.inner.put(key, body, contentType);
  }

  async get(key: string): Promise<Buffer> {
    assertAttachmentStorageKey(key);
    return this.inner.get(key);
  }

  async delete(key: string): Promise<void> {
    assertAttachmentStorageKey(key);
    return this.inner.delete(key);
  }

  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    assertAttachmentStorageKey(key);
    return this.inner.getSignedDownloadUrl(key, expiresInSeconds);
  }

  getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<string | null> {
    assertAttachmentStorageKey(key);
    return this.inner.getSignedUploadUrl(key, contentType, expiresInSeconds);
  }
}

function wrap(inner: AttachmentStorage): AttachmentStorage {
  return new PrefixedAttachmentStorage(inner);
}

export function createAttachmentStorageFromEnv(): AttachmentStorage {
  if (env.ATTACHMENT_STORAGE_DRIVER === "worker") {
    const url = env.ATTACHMENT_WORKER_URL;
    const secret = env.ATTACHMENT_WORKER_SECRET;
    if (!url || !secret) {
      throw new Error(
        "ATTACHMENT_STORAGE_DRIVER=worker requires ATTACHMENT_WORKER_URL and ATTACHMENT_WORKER_SECRET"
      );
    }
    return wrap(new WorkerAttachmentStorage(url, secret));
  }
  if (env.ATTACHMENT_STORAGE_DRIVER === "s3") {
    const bucket = env.ATTACHMENT_S3_BUCKET;
    const accessKeyId = env.ATTACHMENT_S3_ACCESS_KEY_ID;
    const secretAccessKey = env.ATTACHMENT_S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "ATTACHMENT_STORAGE_DRIVER=s3 requires ATTACHMENT_S3_BUCKET, ATTACHMENT_S3_ACCESS_KEY_ID, ATTACHMENT_S3_SECRET_ACCESS_KEY"
      );
    }
    return wrap(
      new S3AttachmentStorage({
        bucket,
        region: env.ATTACHMENT_S3_REGION ?? "auto",
        endpoint: env.ATTACHMENT_S3_ENDPOINT,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: env.ATTACHMENT_S3_FORCE_PATH_STYLE
      })
    );
  }
  return wrap(new LocalAttachmentStorage(env.ATTACHMENT_STORAGE_DIR ?? defaultAttachmentStorageDir()));
}

export function getAttachmentStorage(): AttachmentStorage {
  if (!cached) cached = createAttachmentStorageFromEnv();
  return cached;
}

/** Test helper — reset singleton between suites. */
export function setAttachmentStorageForTests(storage: AttachmentStorage | null): void {
  cached = storage;
}

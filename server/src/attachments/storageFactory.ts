import { env } from "../env.js";
import { LocalAttachmentStorage, defaultAttachmentStorageDir } from "./localStorage.js";
import { S3AttachmentStorage } from "./s3Storage.js";
import type { AttachmentStorage } from "./storage.js";

let cached: AttachmentStorage | null = null;

export function createAttachmentStorageFromEnv(): AttachmentStorage {
  if (env.ATTACHMENT_STORAGE_DRIVER === "s3") {
    const bucket = env.ATTACHMENT_S3_BUCKET;
    const accessKeyId = env.ATTACHMENT_S3_ACCESS_KEY_ID;
    const secretAccessKey = env.ATTACHMENT_S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "ATTACHMENT_STORAGE_DRIVER=s3 requires ATTACHMENT_S3_BUCKET, ATTACHMENT_S3_ACCESS_KEY_ID, ATTACHMENT_S3_SECRET_ACCESS_KEY"
      );
    }
    return new S3AttachmentStorage({
      bucket,
      region: env.ATTACHMENT_S3_REGION ?? "auto",
      endpoint: env.ATTACHMENT_S3_ENDPOINT,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: env.ATTACHMENT_S3_FORCE_PATH_STYLE
    });
  }
  return new LocalAttachmentStorage(env.ATTACHMENT_STORAGE_DIR ?? defaultAttachmentStorageDir());
}

export function getAttachmentStorage(): AttachmentStorage {
  if (!cached) cached = createAttachmentStorageFromEnv();
  return cached;
}

/** Test helper — reset singleton between suites. */
export function setAttachmentStorageForTests(storage: AttachmentStorage | null): void {
  cached = storage;
}

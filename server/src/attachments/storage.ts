/**
 * Object storage adapter for workspace attachments.
 *
 * Env (document in ops notes; do not commit secrets):
 * - ATTACHMENT_STORAGE_DRIVER=local|s3 (default: local)
 * - ATTACHMENT_STORAGE_DIR — local FS root (default: server/data/attachments)
 * - ATTACHMENT_S3_BUCKET, ATTACHMENT_S3_REGION, ATTACHMENT_S3_ENDPOINT (optional for R2/MinIO)
 * - ATTACHMENT_S3_ACCESS_KEY_ID, ATTACHMENT_S3_SECRET_ACCESS_KEY
 * - ATTACHMENT_S3_FORCE_PATH_STYLE=true for MinIO
 */

export interface AttachmentStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * Optional short-lived download URL. Local driver returns null — callers stream via API.
   */
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null>;
  /**
   * Optional short-lived upload URL for direct-to-store PUT. Local returns null — use API multipart.
   */
  getSignedUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string | null>;
}

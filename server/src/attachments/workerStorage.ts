import type { AttachmentStorage } from "./storage.js";

/**
 * Talks to the tymio-attachments Cloudflare Worker (R2 binding behind SHARED_SECRET).
 * Signed URLs are not used — the Tymio API streams bytes after tenant auth.
 */
export class WorkerAttachmentStorage implements AttachmentStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string
  ) {}

  private objectUrl(key: string): string {
    const u = new URL("/v1/object", this.baseUrl.replace(/\/+$/, "") + "/");
    u.searchParams.set("key", key);
    return u.toString();
  }

  private headers(contentType?: string): HeadersInit {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.secret}`
    };
    if (contentType) h["Content-Type"] = contentType;
    return h;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: "PUT",
      headers: this.headers(contentType),
      // Node fetch typings reject Buffer; Uint8Array is a valid BodyInit.
      body: new Uint8Array(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Worker storage put failed (${res.status}): ${text.slice(0, 200)}`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const res = await fetch(this.objectUrl(key), {
      method: "GET",
      headers: this.headers()
    });
    if (res.status === 404) throw new Error("Object not found");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Worker storage get failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(this.objectUrl(key), {
      method: "DELETE",
      headers: this.headers()
    });
    if (res.status === 404 || res.status === 204 || res.ok) return;
    const text = await res.text().catch(() => "");
    throw new Error(`Worker storage delete failed (${res.status}): ${text.slice(0, 200)}`);
  }

  async getSignedDownloadUrl(_key: string, _expiresInSeconds: number): Promise<string | null> {
    return null;
  }

  async getSignedUploadUrl(
    _key: string,
    _contentType: string,
    _expiresInSeconds: number
  ): Promise<string | null> {
    return null;
  }
}

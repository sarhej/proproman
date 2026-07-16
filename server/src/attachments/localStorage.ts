import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AttachmentStorage } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function defaultAttachmentStorageDir(): string {
  return path.resolve(__dirname, "../../data/attachments");
}

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || path.isAbsolute(key) || key.startsWith("/") || key.includes("\\")) {
    throw new Error("Invalid storage key");
  }
}

export class LocalAttachmentStorage implements AttachmentStorage {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep) && full !== path.resolve(this.rootDir)) {
      throw new Error("Invalid storage key path");
    }
    return full;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
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

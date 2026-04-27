import fs from "node:fs/promises";
import path from "node:path";

/**
 * Writes UTF-8 file; if content equals existing, no-op (no backup).
 * Otherwise backs up previous content to `<path>.tymio-bak-<ms>`.
 * Creates parent directories.
 */
export async function writeTextFileWithBackup(filePath: string, content: string): Promise<boolean> {
  try {
    const prev = await fs.readFile(filePath, "utf8");
    if (prev === content) {
      return false;
    }
    const bak = `${filePath}.tymio-bak-${Date.now()}`;
    await fs.writeFile(bak, prev, "utf8");
    process.stderr.write(`Backup: ${bak}\n`);
  } catch {
    /* missing file */
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolvePublicHubOrigin } from "./publicHubOrigin.js";
import { resolveSkillInstallPath } from "./skillPaths.js";

export type SkillIndexRow = {
  id: string;
  version: string;
  sha256: string;
  description: string;
};

export function sha256Utf8(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export async function fetchSkillIndex(origin: string): Promise<SkillIndexRow[]> {
  const url = `${origin.replace(/\/+$/, "")}/skills/index.json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`skills index ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<SkillIndexRow[]>;
}

export type InstallManifestPayload = {
  targetPath: string;
  body: string;
  sha256: string;
  etag?: string;
};

export async function fetchInstallManifest(
  origin: string,
  id: string,
  client: string,
  scope: string
): Promise<{ ok: true; data: InstallManifestPayload } | { ok: false; status: number; error: string }> {
  const q = new URLSearchParams({ client, scope });
  const url = `${origin.replace(/\/+$/, "")}/skills/${encodeURIComponent(id)}/install-manifest?${q}`;
  const res = await fetch(url);
  const raw = await res.text();
  let parsed: { error?: string } & InstallManifestPayload;
  try {
    parsed = JSON.parse(raw) as { error?: string } & InstallManifestPayload;
  } catch {
    return { ok: false, status: res.status, error: raw || res.statusText };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: parsed.error ?? res.statusText };
  }
  if (!parsed.targetPath || parsed.body === undefined || !parsed.sha256) {
    return { ok: false, status: 500, error: "Invalid install-manifest response" };
  }
  return { ok: true, data: parsed };
}

/** Write skill body to resolved path; backup if replacing. Returns true if file changed. */
export async function writeSkillFile(
  manifest: InstallManifestPayload,
  cwd: string
): Promise<{ dest: string; changed: boolean }> {
  const dest = resolveSkillInstallPath(manifest.targetPath, cwd);
  const nextBody = manifest.body;
  const nextHash = manifest.sha256;
  try {
    const prev = await fs.readFile(dest, "utf8");
    if (sha256Utf8(prev) === nextHash) {
      return { dest, changed: false };
    }
    await fs.writeFile(`${dest}.tymio-bak-${Date.now()}`, prev, "utf8");
    process.stderr.write(`Backup: ${dest}.tymio-bak-…\n`);
  } catch {
    /* no file */
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, nextBody, "utf8");
  return { dest, changed: true };
}

export async function removeSkillFile(targetPath: string, cwd: string): Promise<{ dest: string; removed: boolean }> {
  const dest = resolveSkillInstallPath(targetPath, cwd);
  try {
    await fs.unlink(dest);
    return { dest, removed: true };
  } catch {
    return { dest, removed: false };
  }
}


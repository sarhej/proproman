import { createHmac, timingSafeEqual } from "node:crypto";

export type VcsOAuthStatePayload = {
  connectionId: string;
  tenantId: string;
  exp: number;
};

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeVcsOAuthState(secret: string, payload: VcsOAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(secret, body);
  return `${body}.${sig}`;
}

export function decodeVcsOAuthState(secret: string, token: string): VcsOAuthStatePayload | null {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(secret, body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as VcsOAuthStatePayload;
    if (
      typeof parsed.connectionId !== "string" ||
      typeof parsed.tenantId !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

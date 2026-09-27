/**
 * Private R2 blob proxy for Tymio attachments.
 *
 * Railway (or local) holds ATTACHMENT_WORKER_URL + ATTACHMENT_WORKER_SECRET.
 * R2 credentials never leave Cloudflare. Keys must be tenants/{tenantId}/attachments/...
 */

export interface Env {
  ATTACHMENTS: R2Bucket;
  SHARED_SECRET: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function isAllowedKey(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) return false;
  return /^tenants\/[^/]+\/attachments\//.test(key);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json(200, { ok: true, service: "tymio-attachments" });
    }

    const auth = request.headers.get("Authorization") || "";
    if (!env.SHARED_SECRET || auth !== `Bearer ${env.SHARED_SECRET}`) {
      return json(401, { error: "Unauthorized" });
    }

    if (url.pathname !== "/v1/object") {
      return json(404, { error: "Not found" });
    }

    const key = url.searchParams.get("key") || "";
    if (!isAllowedKey(key)) {
      return json(400, { error: "Invalid storage key" });
    }

    try {
      if (request.method === "PUT") {
        const contentType = request.headers.get("Content-Type") || "application/octet-stream";
        await env.ATTACHMENTS.put(key, request.body, {
          httpMetadata: { contentType }
        });
        return json(200, { ok: true });
      }

      if (request.method === "GET") {
        const obj = await env.ATTACHMENTS.get(key);
        if (!obj) return json(404, { error: "Not found" });
        const headers = new Headers();
        headers.set(
          "Content-Type",
          obj.httpMetadata?.contentType || "application/octet-stream"
        );
        if (obj.size != null) headers.set("Content-Length", String(obj.size));
        return new Response(obj.body, { status: 200, headers });
      }

      if (request.method === "DELETE") {
        await env.ATTACHMENTS.delete(key);
        return new Response(null, { status: 204 });
      }

      return json(405, { error: "Method not allowed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Storage error";
      return json(500, { error: message });
    }
  }
};

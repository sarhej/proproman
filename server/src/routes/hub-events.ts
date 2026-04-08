import { Router } from "express";
import { getTenantId } from "../tenant/requireTenant.js";
import { subscribeHubChanges, type HubChangeEventPayload } from "../services/hubChangeHub.js";

export const hubEventsRouter = Router();

/**
 * SSE stream of hub change notifications for the resolved workspace (session / X-Tenant-Id).
 * Send periodic comment lines so proxies (e.g. Cloudflare ~100s) do not close idle connections.
 */
hubEventsRouter.get("/stream", (req, res) => {
  const tenantId = getTenantId(req);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const send = (payload: HubChangeEventPayload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribe = subscribeHubChanges(tenantId, send);

  const ping = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
});

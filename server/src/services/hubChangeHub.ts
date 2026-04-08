import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Payload pushed over SSE (and emitted after REST/MCP writes). */
export const hubChangeEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string(),
  entityType: z.enum(["INITIATIVE", "FEATURE", "REQUIREMENT"]),
  operation: z.enum(["CREATE", "UPDATE", "DELETE", "REORDER"]),
  changedAt: z.string().datetime(),
  entityId: z.string().nullable().optional(),
  initiativeId: z.string().nullable().optional()
});

export type HubChangeEventPayload = z.infer<typeof hubChangeEventSchema>;

type Listener = (event: HubChangeEventPayload) => void;

const tenantListeners = new Map<string, Set<Listener>>();

export function subscribeHubChanges(tenantId: string, listener: Listener): () => void {
  let set = tenantListeners.get(tenantId);
  if (!set) {
    set = new Set();
    tenantListeners.set(tenantId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) tenantListeners.delete(tenantId);
  };
}

export function notifyHubChange(
  input: Omit<HubChangeEventPayload, "eventId" | "changedAt"> & { tenantId: string }
): HubChangeEventPayload {
  const event: HubChangeEventPayload = {
    eventId: randomUUID(),
    tenantId: input.tenantId,
    entityType: input.entityType,
    operation: input.operation,
    changedAt: new Date().toISOString(),
    entityId: input.entityId ?? null,
    initiativeId: input.initiativeId ?? null
  };
  const set = tenantListeners.get(input.tenantId);
  if (set) {
    for (const fn of set) {
      try {
        fn(event);
      } catch (err) {
        console.error("[hubChangeHub] listener error", err);
      }
    }
  }
  return event;
}

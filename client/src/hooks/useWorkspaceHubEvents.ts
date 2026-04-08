import { useEffect, useRef } from "react";
import type { HubChangeEventPayload } from "../lib/hubChangeEvent";

type Options = {
  enabled: boolean;
  onEvent: (event: HubChangeEventPayload) => void;
};

/**
 * Subscribes to workspace hub change SSE (`/api/hub-events/stream`).
 * Dedupes by `eventId`. Uses session cookies + `X-Tenant-Id` parity via API client tenant header
 * on other requests; stream follows server-resolved active workspace when the header is absent.
 */
export function useWorkspaceHubEvents({ enabled, onEvent }: Options): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    if (typeof EventSource === "undefined") return;

    const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
    const path = "/api/hub-events/stream";
    const url = base ? `${base}${path}` : path;

    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as HubChangeEventPayload;
        if (!data?.eventId) return;
        if (seenRef.current.has(data.eventId)) return;
        seenRef.current.add(data.eventId);
        if (seenRef.current.size > 200) {
          seenRef.current = new Set([...seenRef.current].slice(-120));
        }
        onEventRef.current(data);
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [enabled]);
}

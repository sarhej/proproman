import { useEffect, useRef } from "react";
import type { HubChangeEventPayload } from "../lib/hubChangeEvent";

type Options = {
  enabled: boolean;
  /** When set, subscribe under `/t/:slug/api/hub-events/stream` (canonical workspace plane). */
  workspaceApiSlug?: string | null;
  onEvent: (event: HubChangeEventPayload) => void;
};

/**
 * Subscribes to workspace hub change SSE (`/api/hub-events/stream` or `/t/:slug/api/...`).
 * EventSource cannot send `X-Tenant-Id`; when `workspaceApiSlug` is set, the URL pins the workspace.
 */
export function useWorkspaceHubEvents({ enabled, workspaceApiSlug, onEvent }: Options): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    if (typeof EventSource === "undefined") return;

    const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
    const path =
      workspaceApiSlug && workspaceApiSlug.trim() !== ""
        ? `/t/${encodeURIComponent(workspaceApiSlug.trim())}/api/hub-events/stream`
        : "/api/hub-events/stream";
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
  }, [enabled, workspaceApiSlug]);
}

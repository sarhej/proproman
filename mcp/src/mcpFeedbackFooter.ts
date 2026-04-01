/**
 * Fetches /api/mcp/agent-context (no auth) once and appends feedback instructions to every tool result.
 */
let cachedFooter = "";
let loadPromise: Promise<void> | null = null;

async function loadFromHub(baseUrl: string): Promise<void> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/mcp/agent-context`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as { feedbackReporting?: string };
    if (typeof data.feedbackReporting === "string" && data.feedbackReporting.trim()) {
      cachedFooter = data.feedbackReporting.trim();
    }
  } catch {
    /* hub may be offline during local dev */
  }
}

function ensureLoaded(baseUrl: string): Promise<void> {
  if (cachedFooter) return Promise.resolve();
  if (!loadPromise) loadPromise = loadFromHub(baseUrl);
  return loadPromise;
}

/** Async: resolves to MCP content block with optional feedback footer. */
export async function toolTextWithFeedback(baseUrl: string, body: string) {
  await ensureLoaded(baseUrl);
  const text = cachedFooter ? `${body}\n\n---\n${cachedFooter}` : body;
  return { content: [{ type: "text" as const, text }] };
}

/**
 * WebMCP — https://webmachinelearning.github.io/webmcp/
 * Use navigator.modelContext.registerTool() (not provideContext); optional AbortSignal unregisters.
 */

export interface WebMcpInitiativeSummary {
  id: string;
  title: string;
  status: string;
}

export interface WebMcpHubToolOptions {
  onSearchInitiatives: (query: string) => Promise<WebMcpInitiativeSummary[]>;
  onOpenInitiative: (id: string) => void;
  onCreateInitiative: () => void;
}

type RegisterToolFn = (
  tool: {
    name: string;
    description: string;
    inputSchema?: object;
    execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  },
  options?: { signal?: AbortSignal }
) => void;

function getRegisterTool(): RegisterToolFn | undefined {
  if (typeof navigator === "undefined" || !("modelContext" in navigator)) return undefined;
  const mc = (navigator as Navigator & { modelContext?: { registerTool?: RegisterToolFn } }).modelContext;
  return typeof mc?.registerTool === "function" ? mc.registerTool.bind(mc) : undefined;
}

/**
 * Public-site tools (run on every page load, including signed-out homepage) for agent discovery scans.
 */
export function registerPublicWebMcpTools(
  navigate: (to: string) => void,
  signal: AbortSignal
): void {
  const registerTool = getRegisterTool();
  if (!registerTool) return;

  registerTool(
    {
      name: "tymio.open_wiki",
      description: "Navigate to the Tymio public documentation wiki (MCP, workspace atlas, guides).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        navigate("/wiki");
        return { ok: true as const, path: "/wiki" };
      }
    },
    { signal }
  );

  registerTool(
    {
      name: "tymio.open_register_workspace",
      description: "Navigate to the workspace registration flow for a new team hub.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        navigate("/register-workspace");
        return { ok: true as const, path: "/register-workspace" };
      }
    },
    { signal }
  );
}

/**
 * Hub tools when the user is in a workspace with loaded initiatives.
 */
export function registerHubWebMcpTools(options: WebMcpHubToolOptions, signal: AbortSignal): void {
  const registerTool = getRegisterTool();
  if (!registerTool) return;

  registerTool(
    {
      name: "tymio.search_initiatives",
      description: "Search initiatives in the current workspace by title, description, or domain name.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Case-insensitive substring to match" }
        },
        required: ["query"],
        additionalProperties: false
      },
      execute: async (args) => {
        const query = String(args.query ?? "");
        const results = await options.onSearchInitiatives(query);
        return { results };
      }
    },
    { signal }
  );

  registerTool(
    {
      name: "tymio.open_initiative",
      description: "Open the initiative detail panel for a given initiative id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Initiative id" } },
        required: ["id"],
        additionalProperties: false
      },
      execute: async (args) => {
        const id = String(args.id ?? "");
        options.onOpenInitiative(id);
        return { ok: true as const, id };
      }
    },
    { signal }
  );

  registerTool(
    {
      name: "tymio.open_create_initiative",
      description: "Open the create-initiative form when the user has permission to create.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        options.onCreateInitiative();
        return { ok: true as const };
      }
    },
    { signal }
  );
}

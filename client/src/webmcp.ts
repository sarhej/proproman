/**
 * WebMCP Support (navigator.modelContext.provideContext)
 * Exposes site tools to AI agents via the browser.
 * @see https://webmachinelearning.github.io/webmcp/
 */

export interface WebMcpInitiativeSummary {
  id: string;
  title: string;
  status: string;
}

export interface WebMcpOptions {
  onSearchInitiatives: (query: string) => Promise<WebMcpInitiativeSummary[]>;
  onOpenInitiative: (id: string) => void;
  onCreateInitiative: () => void;
}

export function setupWebMcp(options: WebMcpOptions) {
  if (typeof navigator === "undefined" || !("modelContext" in (navigator as any))) {
    // console.log("[WebMCP] Not supported in this browser");
    return;
  }

  try {
    const modelContext = (navigator as any).modelContext;

    modelContext.provideContext({
      tools: [
        {
          name: "search_initiatives",
          description: "Search for product initiatives in the current workspace",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" }
            },
            required: ["query"]
          },
          execute: async ({ query }: { query: string }) => {
            const results = await options.onSearchInitiatives(query);
            return { results };
          }
        },
        {
          name: "open_initiative",
          description: "Open the detail panel for a specific initiative",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Initiative ID" }
            },
            required: ["id"]
          },
          execute: async ({ id }: { id: string }) => {
            options.onOpenInitiative(id);
            return { success: true, message: `Opened initiative ${id}` };
          }
        },
        {
          name: "create_initiative",
          description: "Open the form to create a new initiative",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          },
          execute: async () => {
            options.onCreateInitiative();
            return { success: true, message: "Opened creation form" };
          }
        }
      ]
    });
    // console.log("[WebMCP] Context provided successfully");
  } catch (err) {
    console.error("[WebMCP] Failed to provide context:", err);
  }
}

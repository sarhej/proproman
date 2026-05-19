import { randomUUID } from "node:crypto";
import express, { type NextFunction, Request, Response } from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { env } from "../env.js";
import { runWithTenant, type TenantContext } from "../tenant/tenantContext.js";
import { TymioOAuthProvider, handleGoogleCallback, getMcpBaseUrl, loadMcpOAuthClients } from "./oauth-provider.js";
import { resolveMcpTenantContextFromWorkspaceSlug } from "./resolveMcpTenantContext.js";
import { registerGlobalMcpTools } from "./globalMcpTools.js";
import { registerTools } from "./tools.js";
import {
  buildTenantMcpProtectedResourceMetadata,
  globalMcpProtectedResourceMetadataUrl,
  tenantMcpProtectedResourceMetadataUrl
} from "./mcpProtectedResource.js";
import {
  prepareExistingMcpTransportForRequest,
  shouldStartNewMcpSessionAfterStaleId
} from "./mcpSessionRouting.js";

const provider = new TymioOAuthProvider();

function createMcpServer(mode: "tenant" | "global"): McpServer {
  const server = new McpServer(
    { name: "tymio-hub", version: "1.0.0" },
    { capabilities: { logging: {} } }
  );
  if (mode === "global") {
    registerGlobalMcpTools(server);
  } else {
    registerTools(server);
  }
  return server;
}

const transports = new Map<string, StreamableHTTPServerTransport>();

export function mountMcp(app: express.Express): void {
  const base = getMcpBaseUrl();
  if (env.NODE_ENV === "production" && (base.includes("localhost") || base.startsWith("http://127."))) {
    console.warn("[MCP] CLIENT_URL should be your public app URL in production (e.g. https://tymio.app). Current base:", base);
  }
  const issuerUrl = new URL(base);
  const resourceServerUrl = new URL(`${base}/mcp`);

  // MCP OAuth auth routes (/.well-known/*, /authorize, /token, /register, /revoke)
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl,
      scopesSupported: ["mcp:tools"],
      resourceName: "Tymio MCP"
    })
  );

  // Workspace MCP: PRM must advertise `resource` = `…/t/<slug>/mcp` (Cursor validates vs Server URL).
  app.get(
    "/.well-known/oauth-protected-resource/t/:workspaceSlug/mcp",
    cors(),
    (req: Request, res: Response) => {
      const slug = String(req.params.workspaceSlug ?? "");
      res.status(200).json(buildTenantMcpProtectedResourceMetadata(base, issuerUrl.href, slug));
    }
  );

  // Google OAuth callback (the intermediate redirect from Google back to us)
  app.get("/mcp-oauth/google/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code || !state) {
        res.status(400).send("Missing code or state");
        return;
      }
      const { redirectUri } = await handleGoogleCallback(code, state);
      res.redirect(redirectUri);
    } catch (err) {
      console.error("MCP Google callback error:", err);
      res.status(500).send("Authentication failed");
    }
  });

  // Bearer auth middleware for MCP endpoint. Wrap verifier so we log any thrown error
  // (SDK catches and sends 500 without calling next(err), so our global handler never runs).
  const loggingVerifier = {
    async verifyAccessToken(token: string) {
      try {
        return await provider.verifyAccessToken(token);
      } catch (err) {
        const isExpired =
          (err as Error & { code?: string }).code === "ERR_JWT_EXPIRED" ||
          (err as Error).name === "JWTExpired";
        if (isExpired) {
          throw new InvalidTokenError("Token has expired");
        }
        console.error("[MCP] Bearer auth / verifyAccessToken error:", err);
        if (err instanceof Error && err.stack) console.error(err.stack);
        throw err;
      }
    }
  };
  const bearerAuthGlobal = requireBearerAuth({
    verifier: loggingVerifier,
    requiredScopes: [],
    resourceMetadataUrl: globalMcpProtectedResourceMetadataUrl(base)
  });

  function bearerAuthTenant(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.workspaceSlug ?? "");
    const resourceMetadataUrl = tenantMcpProtectedResourceMetadataUrl(base, slug);
    requireBearerAuth({
      verifier: loggingVerifier,
      requiredScopes: [],
      resourceMetadataUrl
    })(req, res, next);
  }

  const verifyToken = (t: string) => provider.verifyAccessToken(t);

  async function mcpStreamableHttpHandler(
    req: Request,
    res: Response,
    options:
      | { mode: "global" }
      | { mode: "tenant"; resolveTenant: () => Promise<TenantContext | undefined> }
  ): Promise<void> {
    try {
      const handleTransportRequest = async (mcpMode: "tenant" | "global") => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          prepareExistingMcpTransportForRequest(transport, req);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        if (sessionId && !transports.has(sessionId)) {
          if (shouldStartNewMcpSessionAfterStaleId(sessionId, false, req.body)) {
            console.info(
              "[MCP] Stale mcp-session-id with initialize — starting new session (deploy or reconnect)"
            );
          } else {
            res.status(404).json({ error: "Session not found" });
            return;
          }
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID()
        });

        const server = createMcpServer(mcpMode);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
          transport.onclose = () => {
            transports.delete(transport.sessionId!);
          };
        }
      };

      if (options.mode === "global") {
        await handleTransportRequest("global");
        return;
      }

      const tenantContext = await options.resolveTenant();
      if (!tenantContext) {
        res.status(403).json({
          error:
            "No access to this workspace via MCP, or workspace not found. Use POST /t/<workspace-slug>/mcp with a slug you belong to."
        });
        return;
      }

      req.tenantContext = tenantContext;
      await runWithTenant(tenantContext, () => handleTransportRequest("tenant"));
    } catch (err) {
      console.error("MCP request error:", err);
      if (err instanceof Error && err.stack) console.error(err.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }

  app.all("/mcp", bearerAuthGlobal, async (req: Request, res: Response) => {
    await mcpStreamableHttpHandler(req, res, { mode: "global" });
  });

  app.all("/t/:workspaceSlug/mcp", bearerAuthTenant, async (req: Request, res: Response) => {
    const slug = String(req.params.workspaceSlug ?? "");
    await mcpStreamableHttpHandler(req, res, {
      mode: "tenant",
      resolveTenant: () => resolveMcpTenantContextFromWorkspaceSlug(req, slug, verifyToken)
    });
  });

  // Hydrate OAuth client store from DB (non-blocking; avoids Invalid client_id after deploy)
  loadMcpOAuthClients().catch((err) => {
    console.error("[MCP] Failed to load OAuth clients from DB (table may be missing). Re-auth after migration.", err);
  });
  console.log("MCP Streamable HTTP mounted at /mcp and /t/:workspaceSlug/mcp");
}

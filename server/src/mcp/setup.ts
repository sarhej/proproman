import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { runWithTenant } from "../tenant/tenantContext.js";
import { TymioOAuthProvider, handleGoogleCallback, getMcpBaseUrl, loadMcpOAuthClients } from "./oauth-provider.js";
import { resolveMcpTenantContext } from "./resolveMcpTenantContext.js";
import { registerTools } from "./tools.js";

const provider = new TymioOAuthProvider();

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "tymio-hub", version: "1.0.0" },
    { capabilities: { logging: {} } }
  );
  registerTools(server);
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
  const bearerAuth = requireBearerAuth({
    verifier: loggingVerifier,
    requiredScopes: [],
    resourceMetadataUrl: `${base}/.well-known/oauth-protected-resource/mcp`
  });

  // MCP Streamable HTTP endpoint
  app.all("/mcp", bearerAuth, async (req: Request, res: Response) => {
    try {
      const handleTransportRequest = async () => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
          return;
        }

        if (sessionId && !transports.has(sessionId)) {
          res.status(404).json({ error: "Session not found" });
          return;
        }

        // New session: create transport, connect server, then handle the request.
        // The session ID is generated inside handleRequest, so we store after.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID()
        });

        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
          transport.onclose = () => {
            transports.delete(transport.sessionId!);
          };
        }
      };

      const tenantContext = await resolveMcpTenantContext(req, (t) => provider.verifyAccessToken(t), prisma);
      if (!tenantContext) {
        res.status(403).json({
          error: "No active workspace membership. Connect to a workspace before using MCP tools."
        });
        return;
      }

      req.tenantContext = tenantContext;
      await runWithTenant(tenantContext, handleTransportRequest);
    } catch (err) {
      console.error("MCP request error:", err);
      if (err instanceof Error && err.stack) console.error(err.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Hydrate OAuth client store from DB (non-blocking; avoids Invalid client_id after deploy)
  loadMcpOAuthClients().catch((err) => {
    console.error("[MCP] Failed to load OAuth clients from DB (table may be missing). Re-auth after migration.", err);
  });
  console.log("MCP OAuth endpoint mounted at /mcp");
}

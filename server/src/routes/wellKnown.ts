import { Router, type Request, type Response } from "express";
import cors from "cors";
import { getMcpBaseUrl } from "../mcp/oauth-provider.js";
import { getSkillIndexRows } from "../skills/skillCatalog.js";

export const wellKnownRouter = Router();

// Enable CORS for all .well-known routes as they are intended for discovery by agents
wellKnownRouter.use(cors());

/**
 * Goal: Include Link response headers for agent discovery (RFC 8288)
 * This is handled in the main index.ts for the homepage, but we can also
 * include them in responses from this router if appropriate.
 */

/**
 * Goal: Publish an API catalog for automated API discovery (RFC 9727)
 * Issue: API Catalog returned HTML instead of JSON
 */
wellKnownRouter.get("/api-catalog", (_req: Request, res: Response) => {
  const base = getMcpBaseUrl();
  
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", "application/linkset+json; charset=utf-8");
  
  res.json({
    linkset: [
      {
        anchor: `${base}/api`,
        "service-desc": [
          {
            href: `${base}/openapi.json`,
            type: "application/openapi+json"
          }
        ],
        "service-doc": [
          {
            href: `${base}/wiki`,
            type: "text/html"
          }
        ],
        status: [
          {
            href: `${base}/api/health`,
            type: "application/json"
          }
        ]
      }
    ]
  });
});

/**
 * Goal: Publish an MCP Server Card for agent discovery (SEP-1649)
 */
wellKnownRouter.get("/mcp/server-card.json", (_req: Request, res: Response) => {
  const base = getMcpBaseUrl();
  
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    serverInfo: {
      name: "tymio-hub",
      version: "1.0.0",
      description: "Tymio Product Management Hub MCP Server"
    },
    transport: {
      type: "streamable-http",
      endpoint: `${base}/mcp`
    },
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {}
    }
  });
});

/**
 * Goal: Publish an agent skills discovery index
 * Issue: Agent Skills index returned HTML instead of JSON
 */
wellKnownRouter.get("/agent-skills/index.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  
  const base = getMcpBaseUrl();
  const skills = getSkillIndexRows().map((skill) => ({
    name: skill.id,
    type: "markdown",
    description: skill.description,
    url: `${base}/skills/${encodeURIComponent(skill.id)}.md`,
    sha256: skill.sha256
  }));

  res.json({
    $schema: "https://agentskills.io/schema/v0.2.0/index.json",
    skills
  });
});

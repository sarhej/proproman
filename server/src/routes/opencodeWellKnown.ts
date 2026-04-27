import type { Request, Response } from "express";
import { getMcpBaseUrl } from "../mcp/oauth-provider.js";

/**
 * OpenCode organizational default: remote MCP at discovery URL (`GET /.well-known/opencode`).
 * @see https://opencode.ai/docs/config — Remote config precedence.
 */
export function opencodeWellKnownHandler(_req: Request, res: Response): void {
  const base = getMcpBaseUrl().replace(/\/+$/, "");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({
    mcp: {
      tymio: {
        type: "remote",
        url: `${base}/mcp`,
        enabled: true
      }
    }
  });
}

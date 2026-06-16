import { describe, it, expect } from "vitest";
import {
  buildBootstrapCommand,
  buildClaudeMcpAddCommand,
  buildClaudeProjectMcpJson,
  buildCursorMcpInstallLink,
  buildCursorProjectMcpJson,
  encodeMcpConfigBase64,
  mcpServerName
} from "./mcpInstallLinks";

describe("mcpInstallLinks", () => {
  const mcpUrl = "https://tymio.app/t/acme/mcp";

  it("mcpServerName uses slug suffix", () => {
    expect(mcpServerName("acme")).toBe("tymio-acme");
    expect(mcpServerName("")).toBe("tymio-discovery");
  });

  it("encodeMcpConfigBase64 matches known payload", () => {
    expect(encodeMcpConfigBase64({ url: mcpUrl })).toBe("eyJ1cmwiOiJodHRwczovL3R5bWlvLmFwcC90L2FjbWUvbWNwIn0=");
  });

  it("buildCursorMcpInstallLink encodes name and config", () => {
    const link = buildCursorMcpInstallLink(mcpUrl, "tymio-acme");
    expect(link.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?")).toBe(true);
    expect(link).toContain("name=tymio-acme");
    expect(link).toContain(
      "config=eyJ1cmwiOiJodHRwczovL3R5bWlvLmFwcC90L2FjbWUvbWNwIn0%3D"
    );
  });

  it("buildClaudeMcpAddCommand includes transport and scope", () => {
    expect(buildClaudeMcpAddCommand(mcpUrl, "tymio-acme")).toBe(
      "claude mcp add --transport http --scope project tymio-acme https://tymio.app/t/acme/mcp"
    );
  });

  it("buildClaudeProjectMcpJson is valid JSON with http type", () => {
    const parsed = JSON.parse(buildClaudeProjectMcpJson(mcpUrl, "tymio-acme")) as {
      mcpServers: Record<string, { type: string; url: string }>;
    };
    expect(parsed.mcpServers["tymio-acme"]).toEqual({ type: "http", url: mcpUrl });
  });

  it("buildCursorProjectMcpJson is valid JSON with url", () => {
    const parsed = JSON.parse(buildCursorProjectMcpJson(mcpUrl, "tymio-acme")) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(parsed.mcpServers["tymio-acme"]).toEqual({ url: mcpUrl });
  });

  it("buildBootstrapCommand includes slug on default hub", () => {
    expect(buildBootstrapCommand("acme", "https://tymio.app")).toBe(
      "npx @tymio/mcp-server bootstrap --client all --scope project --slug acme"
    );
  });

  it("buildBootstrapCommand prefixes TYMIO_MCP_URL on self-hosted origin", () => {
    expect(buildBootstrapCommand("acme", "https://hub.example.com")).toBe(
      "TYMIO_MCP_URL=https://hub.example.com/t/acme/mcp npx @tymio/mcp-server bootstrap --client all --scope project --slug acme"
    );
  });
});

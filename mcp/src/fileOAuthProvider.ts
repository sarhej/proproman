import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { ensureConfigDir, getTymioConfigDir } from "./configPaths.js";

const CLIENT_FILE = "oauth-client.json";
const TOKENS_FILE = "oauth-tokens.json";
const DISCOVERY_FILE = "oauth-discovery.json";

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function openUrlInBrowser(url: string): void {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

/**
 * Persists MCP OAuth dynamic registration + tokens for the Tymio hub Streamable HTTP endpoint.
 */
export class FileOAuthProvider implements OAuthClientProvider {
  private readonly dir: string;
  private readonly redirect: URL;
  private codeVerifierValue?: string;
  private oauthState?: string;

  constructor(redirectUrl: URL) {
    this.dir = ensureConfigDir();
    this.redirect = redirectUrl;
  }

  get redirectUrl(): URL {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirect.toString()],
      client_name: "Tymio MCP CLI",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools"
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return readJson<OAuthClientInformationMixed>(path.join(this.dir, CLIENT_FILE));
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    writeJson(path.join(this.dir, CLIENT_FILE), clientInformation);
  }

  tokens(): OAuthTokens | undefined {
    return readJson<OAuthTokens>(path.join(this.dir, TOKENS_FILE));
  }

  saveTokens(tokens: OAuthTokens): void {
    writeJson(path.join(this.dir, TOKENS_FILE), tokens);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.codeVerifierValue = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.codeVerifierValue) throw new Error("Missing PKCE code verifier");
    return this.codeVerifierValue;
  }

  async state(): Promise<string> {
    if (!this.oauthState) {
      this.oauthState = randomBytes(16).toString("hex");
    }
    return this.oauthState;
  }

  clearLoginSession(): void {
    this.codeVerifierValue = undefined;
    this.oauthState = undefined;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    process.stderr.write(`Opening browser to sign in to Tymio…\n${authorizationUrl.toString()}\n`);
    openUrlInBrowser(authorizationUrl.toString());
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    writeJson(path.join(this.dir, DISCOVERY_FILE), state);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return readJson<OAuthDiscoveryState>(path.join(this.dir, DISCOVERY_FILE));
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
    const base = getTymioConfigDir();
    const rm = (f: string) => {
      try {
        fs.unlinkSync(path.join(base, f));
      } catch {
        /* ignore */
      }
    };
    if (scope === "all" || scope === "tokens") rm(TOKENS_FILE);
    if (scope === "all" || scope === "client") rm(CLIENT_FILE);
    if (scope === "all" || scope === "discovery") rm(DISCOVERY_FILE);
    if (scope === "all" || scope === "verifier") {
      this.codeVerifierValue = undefined;
    }
  }
}

export function removeAllOAuthFiles(): void {
  const base = getTymioConfigDir();
  for (const f of [CLIENT_FILE, TOKENS_FILE, DISCOVERY_FILE]) {
    try {
      fs.unlinkSync(path.join(base, f));
    } catch {
      /* ignore */
    }
  }
}

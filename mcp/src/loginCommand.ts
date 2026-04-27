import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { defaultMcpUrl, defaultOAuthRedirectUrl } from "./configPaths.js";
import { FileOAuthProvider } from "./fileOAuthProvider.js";
import { readOAuthLoginTimeoutMs, withTimeout } from "./oauthLoginTimeout.js";
import { startOAuthCallbackServer } from "./oauthCallbackServer.js";

export async function runLoginCommand(mcpUrl: URL = defaultMcpUrl()): Promise<void> {
  const redirectUrl = defaultOAuthRedirectUrl();
  const provider = new FileOAuthProvider(redirectUrl);
  const { waitForCode, close } = await startOAuthCallbackServer(redirectUrl, provider);

  try {
    let result = await auth(provider, { serverUrl: mcpUrl });
    if (result === "REDIRECT") {
      const timeoutMs = readOAuthLoginTimeoutMs();
      const code =
        timeoutMs != null
          ? await withTimeout(
              waitForCode,
              timeoutMs,
              `OAuth login timed out after ${timeoutMs}ms (TYMIO_OAUTH_LOGIN_TIMEOUT_MS). Complete the browser sign-in, or press Ctrl+C and try again.`
            )
          : await waitForCode;
      result = await auth(provider, { serverUrl: mcpUrl, authorizationCode: code });
    } else {
      void waitForCode.catch(() => {
        /* already authorized; browser callback not used */
      });
    }
    if (result !== "AUTHORIZED") {
      throw new Error(`Unexpected auth result: ${result}`);
    }
    provider.clearLoginSession();
    process.stderr.write("Tymio MCP login succeeded. You can run your editor MCP client (tymio-mcp).\n");
  } finally {
    close();
    provider.clearLoginSession();
  }
}

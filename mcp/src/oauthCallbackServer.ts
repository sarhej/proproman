import http from "node:http";
import type { FileOAuthProvider } from "./fileOAuthProvider.js";

export interface OAuthCallbackHandle {
  waitForCode: Promise<string>;
  close: () => void;
}

/**
 * Listens on the host/port of `redirectUrl` and resolves with the authorization `code`
 * once the browser hits the redirect URI. Resolves after the socket is accepting connections.
 */
export async function startOAuthCallbackServer(
  redirectUrl: URL,
  provider: FileOAuthProvider
): Promise<OAuthCallbackHandle> {
  const pathname = redirectUrl.pathname || "/";

  let resolveCode: (code: string) => void;
  let rejectWait: (err: Error) => void;
  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectWait = reject;
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }
      const u = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
      if (u.pathname !== pathname) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const code = u.searchParams.get("code");
      const state = u.searchParams.get("state");
      const errParam = u.searchParams.get("error");
      if (errParam) {
        const desc = u.searchParams.get("error_description") ?? errParam;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<p>Authorization failed: ${escapeHtml(desc)}</p>`);
        rejectWait(new Error(desc));
        return;
      }
      if (!code || !state) {
        res.writeHead(400);
        res.end("Missing code or state");
        rejectWait(new Error("Missing authorization code"));
        return;
      }
      const expected = await provider.state();
      if (state !== expected) {
        res.writeHead(400);
        res.end("Invalid state");
        rejectWait(new Error("OAuth state mismatch"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<p>Signed in to Tymio. You can close this tab and return to the terminal.</p>");
      resolveCode(code);
    } catch (e) {
      res.writeHead(500);
      res.end("Internal error");
      rejectWait(e instanceof Error ? e : new Error(String(e)));
    }
  });

  const host = redirectUrl.hostname;
  const port = Number(redirectUrl.port) || (redirectUrl.protocol === "https:" ? 443 : 80);

  const listening = new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      process.stderr.write(`Listening for OAuth callback on ${redirectUrl.origin}${pathname}\n`);
      server.off("error", reject);
      resolve();
    });
  });

  try {
    await listening;
  } catch (err) {
    server.close();
    throw err instanceof Error ? err : new Error(String(err));
  }

  server.on("error", (err) => {
    rejectWait(err instanceof Error ? err : new Error(String(err)));
  });

  return {
    waitForCode,
    close: () => {
      server.close();
    }
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

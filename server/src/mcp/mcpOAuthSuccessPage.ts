function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface McpOAuthSuccessPageOptions {
  /** Where to send the browser so the MCP client receives the auth code. */
  redirectUri: string;
  /** Shown in copy, e.g. "Cursor" or "your editor". */
  clientLabel?: string;
}

/**
 * HTML interstitial shown after Google OAuth succeeds for remote MCP clients.
 * Auto-redirects to the MCP client's loopback callback while giving the user
 * clear feedback that authorization finished.
 */
export function buildMcpOAuthSuccessPage(options: McpOAuthSuccessPageOptions): string {
  const clientLabel = options.clientLabel ?? "your editor";
  const safeHref = escapeHtml(options.redirectUri);
  const safeRedirectJson = JSON.stringify(options.redirectUri).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signed in to Tymio</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #f4f4f5;
      color: #18181b;
    }
  @media (prefers-color-scheme: dark) {
    body { background: #09090b; color: #fafafa; }
    .card { background: #18181b; border-color: #27272a; }
  }
    .card {
      max-width: 28rem;
      padding: 2rem;
      border: 1px solid #e4e4e7;
      border-radius: 0.75rem;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      text-align: center;
    }
    h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
    p { margin: 0 0 1rem; line-height: 1.5; color: #52525b; }
    a { color: #2563eb; }
    .hint { font-size: 0.875rem; }
  </style>
  <script>
    (function () {
      var target = ${safeRedirectJson};
      setTimeout(function () {
        window.location.replace(target);
      }, 400);
    })();
  </script>
</head>
<body>
  <main class="card">
    <h1>Signed in to Tymio</h1>
    <p>Authorization succeeded. You can close this tab and return to ${escapeHtml(clientLabel)}.</p>
    <p class="hint">Finishing sign-in&hellip; If nothing happens, <a href="${safeHref}">continue here</a>.</p>
  </main>
</body>
</html>`;
}

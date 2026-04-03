import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response } from "express";
import { markdownToHtml } from "./markdownToHtml.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveLegalDocsDir(): string {
  const candidates = [
    path.join(__dirname, "../../../docs/legal"),
    path.join(__dirname, "../../../../docs/legal"),
    path.join(process.cwd(), "docs/legal"),
    path.join(process.cwd(), "../docs/legal"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "TERMS_OF_SERVICE.md"))) {
      return dir;
    }
  }
  throw new Error(
    `[legal] Could not find docs/legal (TERMS_OF_SERVICE.md). Tried: ${candidates.join(", ")}`
  );
}

let cachedDir: string | null = null;

function legalDir(): string {
  if (!cachedDir) cachedDir = resolveLegalDocsDir();
  return cachedDir;
}

const PAGE_CSS = `
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif; max-width: 42rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; line-height: 1.65; color: #1e293b; font-size: 15px; }
  .nav { font-size: 13px; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0; }
  .nav a { color: #0369a1; text-decoration: none; }
  .nav a:hover { text-decoration: underline; }
  .nav span { color: #94a3b8; margin: 0 0.35rem; }
  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.75rem; }
  h2 { font-size: 1.15rem; font-weight: 600; margin: 2rem 0 0.65rem; }
  h3 { font-size: 1.05rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
  p { margin: 0 0 0.85rem; }
  ul { margin: 0 0 1rem; padding-left: 1.35rem; }
  li { margin-bottom: 0.35rem; }
  blockquote { margin: 0 0 1rem; padding: 0.65rem 1rem; border-left: 4px solid #bae6fd; background: #f8fafc; font-size: 14px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin: 0 0 1rem; }
  th, td { border: 1px solid #e2e8f0; padding: 0.45rem 0.65rem; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
  code { background: #f1f5f9; padding: 0.12rem 0.35rem; border-radius: 4px; font-size: 0.88em; }
  a { color: #0369a1; }
`;

function escapeTitle(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapHtml(title: string, bodyHtml: string): string {
  const safeTitle = escapeTitle(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} · Tymio</title>
  <meta name="robots" content="index,follow" />
  <style>${PAGE_CSS}</style>
</head>
<body>
  <nav class="nav" aria-label="Legal">
    <a href="/">Tymio</a><span>·</span><a href="/legal/terms">Terms of Service</a><span>·</span><a href="/legal/privacy">Privacy Policy</a>
  </nav>
  <article>
${bodyHtml}
  </article>
</body>
</html>`;
}

function sendLegalPage(res: Response, title: string, fileName: string): void {
  const filePath = path.join(legalDir(), fileName);
  const md = fs.readFileSync(filePath, "utf8");
  const html = wrapHtml(title, markdownToHtml(md));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(html);
}

export function registerLegalRoutes(app: Express): void {
  app.get("/legal/terms", (_req: Request, res: Response) => {
    try {
      sendLegalPage(res, "Terms of Service", "TERMS_OF_SERVICE.md");
    } catch (e) {
      console.error("[legal] terms", e);
      res.status(500).send("Legal document temporarily unavailable.");
    }
  });
  app.get("/legal/privacy", (_req: Request, res: Response) => {
    try {
      sendLegalPage(res, "Privacy Policy", "PRIVACY_POLICY.md");
    } catch (e) {
      console.error("[legal] privacy", e);
      res.status(500).send("Legal document temporarily unavailable.");
    }
  });
}

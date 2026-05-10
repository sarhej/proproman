import { getPublicSiteOrigin } from "../../lib/publicSiteOrigin";

export const DEFAULT_TITLE = "Tymio";
export const DEFAULT_DESCRIPTION =
  "Tymio — workspace-based product management (initiatives, roadmaps, delivery). Supported UI languages: English, Czech, Slovak, Ukrainian, Polish (codes: en, cs, sk, uk, pl).";

function metaSelector(attr: "name" | "property", key: string): string {
  const v = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `meta[${attr}="${v}"]`;
}

export function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const sel = metaSelector(attr, key);
  let el = document.head.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function upsertLink(rel: string, href: string) {
  const sel = `link[rel="${rel.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  let el = document.head.querySelector(sel) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export type SeoHeadProps = {
  title: string;
  description: string;
  /** Pathname (and optional search), e.g. /wiki/openclaw — must start with / */
  canonicalPath: string;
  /** Default: index,follow */
  robots?: string;
  ogType?: "website" | "article";
  /** Absolute or site-root image URL for og:image / twitter:image */
  imageUrl?: string;
  /** Optional JSON-LD object (Article, WebPage, …) */
  jsonLd?: Record<string, unknown> | null;
};

/** Restores title and meta tags to the defaults shipped in index.html (authenticated app). */
export function resetDocumentSeoDefaults() {
  document.title = DEFAULT_TITLE;
  upsertMeta("name", "description", DEFAULT_DESCRIPTION);
  upsertMeta("name", "robots", "noindex,nofollow");

  upsertMeta("property", "og:title", DEFAULT_TITLE);
  upsertMeta(
    "property",
    "og:description",
    "Product management hub for teams. Interface languages: English, Czech, Slovak, Ukrainian, Polish. JavaScript SPA with MCP and REST APIs."
  );
  upsertMeta("property", "og:type", "website");
  const origin = getPublicSiteOrigin();
  upsertMeta("property", "og:url", `${origin}/`);
  upsertMeta("property", "og:image", `${origin}/logo.png`);
  upsertMeta("property", "og:site_name", DEFAULT_TITLE);

  upsertMeta("name", "twitter:card", "summary");
  upsertMeta("name", "twitter:title", DEFAULT_TITLE);
  upsertMeta("name", "twitter:description", "Workspace-based product management. UI: en, cs, sk, uk, pl. SPA + API/MCP.");
  upsertMeta("name", "twitter:image", `${origin}/logo.png`);

  upsertLink("canonical", `${origin}/`);

  const jsonLdEl = document.head.querySelector('script[data-tymio-seo="jsonld"]');
  if (jsonLdEl) jsonLdEl.remove();
}

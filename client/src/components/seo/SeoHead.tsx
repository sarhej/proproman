import { useLayoutEffect } from "react";
import { getPublicSiteOrigin } from "../../lib/publicSiteOrigin";
import {
  DEFAULT_TITLE,
  upsertLink,
  upsertMeta,
  type SeoHeadProps,
} from "./seoHeadDocument";

export type { SeoHeadProps };

/**
 * Updates document title and primary meta / Open Graph / Twitter tags for public routes.
 * Call `resetDocumentSeoDefaults` from `seoHeadDocument` when leaving public marketing/wiki surfaces.
 */
export function SeoHead({
  title,
  description,
  canonicalPath,
  robots = "index,follow",
  ogType = "website",
  imageUrl,
  jsonLd,
}: SeoHeadProps) {
  useLayoutEffect(() => {
    const origin = getPublicSiteOrigin();
    const path = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
    const canonical = `${origin}${path}`;
    const image = imageUrl ?? `${origin}/logo.png`;

    document.title = title;

    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", robots);

    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", ogType);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", image);
    upsertMeta("property", "og:site_name", DEFAULT_TITLE);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", image);

    upsertLink("canonical", canonical);

    let jsonLdEl = document.head.querySelector('script[data-tymio-seo="jsonld"]');
    if (jsonLd) {
      if (!jsonLdEl) {
        jsonLdEl = document.createElement("script");
        jsonLdEl.setAttribute("type", "application/ld+json");
        jsonLdEl.setAttribute("data-tymio-seo", "jsonld");
        document.head.appendChild(jsonLdEl);
      }
      jsonLdEl.textContent = JSON.stringify(jsonLd);
    } else if (jsonLdEl) {
      jsonLdEl.remove();
    }
  }, [title, description, canonicalPath, robots, ogType, imageUrl, jsonLd]);

  return null;
}

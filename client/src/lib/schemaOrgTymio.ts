/**
 * Reusable https://schema.org fragments for public Tymio surfaces (JSON-LD).
 */

export function schemaOrgPublisherOrganization(origin: string) {
  return {
    "@type": "Organization",
    name: "Tymio",
    url: origin,
    logo: { "@type": "ImageObject", url: `${origin}/logo.png` },
  };
}

/** Minimal reference to the product for TechArticle `about` / similar. */
export function schemaOrgTymioWebApplicationAbout(origin: string) {
  return {
    "@type": "WebApplication",
    name: "Tymio",
    url: origin,
  };
}

export function schemaOrgWebSitePart(origin: string) {
  return {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: "Tymio",
    url: origin,
  };
}

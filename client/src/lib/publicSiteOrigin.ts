/**
 * Canonical origin for SEO (Open Graph, JSON-LD, sitemap hints).
 * Set `VITE_PUBLIC_SITE_URL` in production when the app is served from a stable public URL
 * (e.g. https://tymio.app). Falls back to the browser origin in the client, then tymio.app.
 */
export function getPublicSiteOrigin(): string {
  const env = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  const trimmed = env?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://tymio.app";
}

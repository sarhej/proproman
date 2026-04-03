/**
 * Legal HTML is served by the API (`registerLegalRoutes`). Same host in production;
 * local dev uses Vite proxy for `/legal` when `VITE_API_BASE_URL` is empty.
 */
export function legalPageHref(path: "/legal/terms" | "/legal/privacy"): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

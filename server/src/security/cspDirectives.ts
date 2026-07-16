/**
 * Helmet CSP directive overrides shared with tests.
 * Attachment capture previews use blob: object URLs on <img> — without blob: in
 * img-src the browser blocks the preview and fires onError ("Preview unavailable").
 */
export const CSP_IMG_SRC = [
  "'self'",
  "data:",
  "blob:",
  "https://*.googleusercontent.com",
  "https://*.ggpht.com"
] as const;

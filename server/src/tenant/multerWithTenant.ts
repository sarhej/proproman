import type { NextFunction, Request, Response } from "express";
import { runWithTenant } from "./tenantContext.js";

/**
 * Multer finishes in a callback that drops Express AsyncLocalStorage context
 * (tenant Prisma extension then skips tenantId injection). Re-enter ALS from
 * `req.tenantContext` before continuing the chain.
 */
export function continueAfterMulter(
  req: Request,
  res: Response,
  next: NextFunction,
  err?: unknown
): void {
  if (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Upload failed";
    res.status(400).json({ error: message });
    return;
  }
  const ctx = req.tenantContext;
  if (ctx) {
    runWithTenant(ctx, () => next());
    return;
  }
  next();
}

type MulterMiddleware = (req: Request, res: Response, cb: (err?: unknown) => void) => void;

/** Convenience: wrap `upload.single(field)` so the next handlers keep tenant ALS. */
export function multerSingleWithTenant(uploadFn: MulterMiddleware) {
  return (req: Request, res: Response, next: NextFunction): void => {
    uploadFn(req, res, (err) => continueAfterMulter(req, res, next, err ?? undefined));
  };
}

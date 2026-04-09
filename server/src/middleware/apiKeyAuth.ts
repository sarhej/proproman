import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { env } from "../env.js";
import { prisma } from "../db.js";

/**
 * If API_KEY is configured and the request has Authorization: Bearer <API_KEY>,
 * loads the user (by API_KEY_USER_ID or first SUPER_ADMIN) and sets req.user.
 * Run after passport.session() so session auth still works for browser clients.
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  
  if (!token || !env.API_KEY) {
    next();
    return;
  }

  // Use timingSafeEqual to prevent timing attacks
  const tokenBuffer = Buffer.from(token);
  const keyBuffer = Buffer.from(env.API_KEY);
  
  const isValid = tokenBuffer.length === keyBuffer.length && 
    crypto.timingSafeEqual(tokenBuffer, keyBuffer);

  if (!isValid) {
    next();
    return;
  }

  try {
    const userId = env.API_KEY_USER_ID;
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findFirst({
          where: { role: "SUPER_ADMIN", isActive: true }
        });

    if (!user || !user.isActive) {
      next();
      return;
    }

    const r = req as Request & { user: typeof user; authViaApiKey?: boolean };
    r.user = user;
    r.authViaApiKey = true;
  } catch {
    // ignore DB errors and let normal auth handle it
  }
  next();
}

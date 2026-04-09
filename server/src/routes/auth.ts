import crypto from "node:crypto";
import { Router } from "express";
import { UserRole } from "@prisma/client";
import passport from "passport";
import { z } from "zod";
import { allowWithinWindow } from "../auth/magicLinkRateLimit.js";
import { resolveOrCreateUserFromEmailMagicLink } from "../auth/oauthUserService.js";
import { prisma, prismaUnscoped } from "../db.js";
import { env } from "../env.js";
import { normalizePublicTenantSlug } from "../lib/publicTenantSlug.js";
import { resolveActiveTenantForAuthenticatedUser } from "../lib/resolveActiveTenantForUser.js";
import { getMagicLinkVerifyBaseUrl, isMagicLinkEmailConfigured, sendMagicLinkEmail } from "../services/mailer.js";

export const authRouter = Router();

async function autoSwitchToSlug(userId: string, slug: string, req: import("express").Request): Promise<void> {
  const normalized = normalizePublicTenantSlug(slug);
  if (!normalized) return;
  const tenant = await prismaUnscoped.tenant.findFirst({
    where: { slug: { equals: normalized, mode: "insensitive" }, status: "ACTIVE" },
    select: { id: true, status: true },
  });
  if (!tenant) return;

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
  });
  if (!membership) return;

  await prisma.user.update({ where: { id: userId }, data: { activeTenantId: tenant.id } });
  req.session.activeTenantId = tenant.id;
}

function finalizeSessionAfterLogin(
  req: import("express").Request,
  res: import("express").Response,
  sessionUser: Express.User,
  providerLabel: string
): void {
  const pendingSlug = req.session.pendingTenantSlug;
  delete req.session.pendingTenantSlug;

  const finalize = () => {
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[auth] Session persist after login:", saveErr?.message ?? saveErr);
        const base = env.CLIENT_URL.replace(/\/$/, "");
        res.redirect(`${base}/?error=login_failed`);
        return;
      }
      const base = env.CLIENT_URL.replace(/\/$/, "");
      const redirectPath = pendingSlug ? `/t/${pendingSlug}` : "";
      console.log("[auth] Login OK redirecting", {
        userId: sessionUser.id,
        email: sessionUser.email,
        sessionId: req.sessionID?.slice(0, 8),
        pendingSlug,
        provider: providerLabel
      });
      res.redirect(`${base}${redirectPath}`);
    });
  };

  if (pendingSlug) {
    autoSwitchToSlug(sessionUser.id, pendingSlug, req)
      .then(finalize)
      .catch(() => finalize());
  } else {
    finalize();
  }
}

function handleOAuthBrowserCallback(
  err: Error | null,
  user: Express.User | false,
  req: import("express").Request,
  res: import("express").Response,
  providerLabel: string
): void {
  if (err) {
    console.error("[auth] %s callback error:", providerLabel, err?.message ?? err);
    const base = env.CLIENT_URL.replace(/\/$/, "");
    res.redirect(`${base}/?error=login_failed`);
    return;
  }
  if (!user) {
    const base = env.CLIENT_URL.replace(/\/$/, "");
    res.redirect(`${base}/?error=login_denied`);
    return;
  }
  const sessionUser = user;
  req.login(sessionUser, (loginErr) => {
    if (loginErr) {
      console.error("[auth] Session save after login:", loginErr?.message ?? loginErr);
      const base = env.CLIENT_URL.replace(/\/$/, "");
      res.redirect(`${base}/?error=login_failed`);
      return;
    }
    finalizeSessionAfterLogin(req, res, sessionUser, providerLabel);
  });
}

authRouter.get("/google", (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    res.status(503).json({ error: "Google OAuth is not configured." });
    return;
  }
  const tenantSlug = typeof req.query.tenantSlug === "string" ? req.query.tenantSlug : undefined;
  if (tenantSlug) {
    req.session.pendingTenantSlug = tenantSlug;
    req.session.save(() => {
      passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
    });
    return;
  }
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
});

authRouter.get("/google/callback", (req, res, next) => {
  passport.authenticate(
    "google",
    { session: true },
    (err: Error | null, user: Express.User | false) => {
      handleOAuthBrowserCallback(err, user, req, res, "Google");
    }
  )(req, res, next);
});

authRouter.get("/microsoft", (req, res, next) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_CALLBACK_URL) {
    res.status(503).json({ error: "Microsoft OAuth is not configured." });
    return;
  }
  const tenantSlug = typeof req.query.tenantSlug === "string" ? req.query.tenantSlug : undefined;
  const authenticate = passport.authenticate("microsoft", {
    prompt: "select_account"
  });
  if (tenantSlug) {
    req.session.pendingTenantSlug = tenantSlug;
    req.session.save(() => {
      authenticate(req, res, next);
    });
    return;
  }
  authenticate(req, res, next);
});

authRouter.get("/microsoft/callback", (req, res, next) => {
  passport.authenticate(
    "microsoft",
    { session: true },
    (err: Error | null, user: Express.User | false) => {
      handleOAuthBrowserCallback(err, user, req, res, "Microsoft");
    }
  )(req, res, next);
});

const emailMagicBodySchema = z.object({
  email: z.string().email().max(320)
});

authRouter.post("/email/request", async (req, res) => {
  const genericOk = () => res.json({ ok: true });

  if (!isMagicLinkEmailConfigured()) {
    res.status(503).json({ error: "Email sign-in is not configured." });
    return;
  }

  const parsed = emailMagicBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    genericOk();
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!allowWithinWindow(`ml:ip:${ip}`, 10, 15 * 60 * 1000)) {
    genericOk();
    return;
  }
  if (!allowWithinWindow(`ml:em:${email}`, 5, 60 * 60 * 1000)) {
    genericOk();
    return;
  }

  try {
    const raw = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
    const ttlMs = env.EMAIL_MAGIC_LINK_TTL_MINUTES * 60_000;
    await prisma.emailLoginToken.create({
      data: {
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });
    const verifyUrl = `${getMagicLinkVerifyBaseUrl()}/api/auth/email/verify?token=${encodeURIComponent(raw)}`;
    await sendMagicLinkEmail(email, verifyUrl);
  } catch (e) {
    console.error("[auth] magic link request:", (e as Error).message);
  }
  genericOk();
});

authRouter.get("/email/verify", (req, res) => {
  const base = env.CLIENT_URL.replace(/\/$/, "");
  const fail = () => res.redirect(`${base}/?error=login_failed`);
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    fail();
    return;
  }
  const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  void (async () => {
    try {
      const row = await prisma.emailLoginToken.findUnique({ where: { tokenHash } });
      if (!row || row.usedAt || row.expiresAt < new Date()) {
        fail();
        return;
      }
      await prisma.emailLoginToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      const user = await resolveOrCreateUserFromEmailMagicLink(row.email);
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[auth] Email verify session:", loginErr);
          fail();
          return;
        }
        finalizeSessionAfterLogin(req, res, user, "Email");
      });
    } catch (e) {
      console.error("[auth] email verify:", (e as Error).message);
      fail();
    }
  })();
});

authRouter.get("/dev-tenants", async (_req, res) => {
  if (env.NODE_ENV === "production" || !env.ALLOW_DEV_AUTH) {
    res.status(403).json({ error: "Dev login is disabled." });
    return;
  }
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, slug: true, status: true, isSystem: true },
    orderBy: { name: "asc" },
  });
  res.json({ tenants });
});

authRouter.post("/dev-login", async (req, res, next) => {
  if (env.NODE_ENV === "production") {
    res.status(403).json({ error: "Dev login is disabled in production." });
    return;
  }

  const allowDevAuth = env.ALLOW_DEV_AUTH;
  if (!allowDevAuth) {
    res.status(403).json({ error: "Dev login is disabled." });
    return;
  }
  try {
    const parsed = z
      .object({
        role: z.nativeEnum(UserRole).optional(),
        tenantId: z.string().min(1).optional(),
        tenantSlug: z.string().min(1).optional(),
      })
      .safeParse(req.body ?? {});
    const role = parsed.success ? parsed.data.role ?? env.DEV_AUTH_ROLE : env.DEV_AUTH_ROLE;

    let tenantId = parsed.success ? parsed.data.tenantId : undefined;
    if (!tenantId && parsed.success && parsed.data.tenantSlug) {
      const s = normalizePublicTenantSlug(parsed.data.tenantSlug);
      if (s) {
        const bySlug = await prismaUnscoped.tenant.findFirst({
          where: { slug: { equals: s, mode: "insensitive" }, status: "ACTIVE" },
          select: { id: true, status: true },
        });
        if (bySlug) tenantId = bySlug.id;
      }
    }

    const user = await prisma.user.upsert({
      where: { email: env.DEV_AUTH_EMAIL },
      create: {
        email: env.DEV_AUTH_EMAIL,
        name: env.DEV_AUTH_NAME,
        role,
        activeTenantId: tenantId ?? null,
      },
      update: {
        name: env.DEV_AUTH_NAME,
        role,
        ...(tenantId ? { activeTenantId: tenantId } : {}),
      },
    });

    if (tenantId) {
      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role: "ADMIN" },
        update: {},
      });
      req.session.activeTenantId = tenantId;
    }

    req.login(user, (err) => {
      if (err) {
        next(err);
        return;
      }
      res.json({ user });
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res) => {
  const hasSession = !!req.sessionID;
  const hasUser = !!req.user;
  if (!hasUser) {
    console.log("[auth] GET /me 401", { hasSession, sessionId: req.sessionID?.slice(0, 8), cookie: req.headers.cookie ? "present" : "missing" });
    res.status(401).json({ user: null });
    return;
  }
  const candidateTenantId = req.tenantContext?.tenantId ?? req.user!.activeTenantId ?? null;
  const activeTenant = await resolveActiveTenantForAuthenticatedUser(req.user!.id, candidateTenantId);
  res.json({ user: req.user, activeTenant });
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }
    req.session.destroy(() => {
      res.clearCookie("dd.sid");
      res.json({ ok: true });
    });
  });
});

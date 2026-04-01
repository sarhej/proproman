import { Router } from "express";
import { UserRole } from "@prisma/client";
import passport from "passport";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { resolveActiveTenantForAuthenticatedUser } from "../lib/resolveActiveTenantForUser.js";

export const authRouter = Router();

async function autoSwitchToSlug(userId: string, slug: string, req: import("express").Request): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!tenant || tenant.status !== "ACTIVE") return;

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
  });
  if (!membership) return;

  await prisma.user.update({ where: { id: userId }, data: { activeTenantId: tenant.id } });
  req.session.activeTenantId = tenant.id;
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
      if (err) {
        console.error("[auth] Google callback error:", err?.message ?? err);
        const base = env.CLIENT_URL.replace(/\/$/, "");
        return res.redirect(`${base}/?error=login_failed`);
      }
      if (!user) {
        const base = env.CLIENT_URL.replace(/\/$/, "");
        return res.redirect(`${base}/?error=login_denied`);
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[auth] Session save after login:", loginErr?.message ?? loginErr);
          const base = env.CLIENT_URL.replace(/\/$/, "");
          return res.redirect(`${base}/?error=login_failed`);
        }

        const pendingSlug = req.session.pendingTenantSlug;
        delete req.session.pendingTenantSlug;

        const finalize = () => {
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("[auth] Session persist after login:", saveErr?.message ?? saveErr);
              const base = env.CLIENT_URL.replace(/\/$/, "");
              return res.redirect(`${base}/?error=login_failed`);
            }
            const base = env.CLIENT_URL.replace(/\/$/, "");
            const redirectPath = pendingSlug ? `/t/${pendingSlug}` : "";
            console.log("[auth] Login OK redirecting", { userId: user.id, email: user.email, sessionId: req.sessionID?.slice(0, 8), pendingSlug });
            res.redirect(`${base}${redirectPath}`);
          });
        };

        if (pendingSlug) {
          autoSwitchToSlug(user.id, pendingSlug, req)
            .then(finalize)
            .catch(() => finalize());
        } else {
          finalize();
        }
      });
    }
  )(req, res, next);
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
      const bySlug = await prisma.tenant.findUnique({
        where: { slug: parsed.data.tenantSlug },
        select: { id: true, status: true },
      });
      if (bySlug && bySlug.status === "ACTIVE") tenantId = bySlug.id;
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

import { Router } from "express";
import { UserRole } from "@prisma/client";
import passport from "passport";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const authRouter = Router();

authRouter.get("/google", (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    res.status(503).json({ error: "Google OAuth is not configured." });
    return;
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
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
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] Session persist after login:", saveErr?.message ?? saveErr);
            const base = env.CLIENT_URL.replace(/\/$/, "");
            return res.redirect(`${base}/?error=login_failed`);
          }
          res.redirect(env.CLIENT_URL);
        });
      });
    }
  )(req, res, next);
});

authRouter.post("/dev-login", async (req, res, next) => {
  const allowDevAuth = env.ALLOW_DEV_AUTH;
  if (!allowDevAuth) {
    res.status(403).json({ error: "Dev login is disabled." });
    return;
  }
  try {
    const parsed = z
      .object({
        role: z.nativeEnum(UserRole).optional()
      })
      .safeParse(req.body ?? {});
    const role = parsed.success ? parsed.data.role ?? env.DEV_AUTH_ROLE : env.DEV_AUTH_ROLE;
    const user = await prisma.user.upsert({
      where: { email: env.DEV_AUTH_EMAIL },
      create: {
        email: env.DEV_AUTH_EMAIL,
        name: env.DEV_AUTH_NAME,
        role
      },
      update: {
        name: env.DEV_AUTH_NAME,
        role
      }
    });
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

authRouter.get("/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ user: null });
    return;
  }
  res.json({ user: req.user });
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

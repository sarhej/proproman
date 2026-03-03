import { Router } from "express";
import passport from "passport";
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

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: true }),
  (_req, res) => {
    res.redirect(env.CLIENT_URL);
  }
);

authRouter.post("/dev-login", async (req, res, next) => {
  const allowDevAuth = env.NODE_ENV !== "production" && env.ALLOW_DEV_AUTH;
  if (!allowDevAuth) {
    res.status(403).json({ error: "Dev login is disabled." });
    return;
  }
  try {
    const user = await prisma.user.upsert({
      where: { email: env.DEV_AUTH_EMAIL },
      create: {
        email: env.DEV_AUTH_EMAIL,
        name: env.DEV_AUTH_NAME,
        role: env.DEV_AUTH_ROLE
      },
      update: {
        name: env.DEV_AUTH_NAME,
        role: env.DEV_AUTH_ROLE
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

import { Router } from "express";
import passport from "passport";
import { env } from "../env.js";

export const authRouter = Router();

authRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: true }),
  (_req, res) => {
    res.redirect(env.CLIENT_URL);
  }
);

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

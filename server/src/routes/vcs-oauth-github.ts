import { Router } from "express";
import { env } from "../env.js";
import { prismaUnscoped } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant, getTenantId } from "../tenant/requireTenant.js";
import { encodeVcsOAuthState, decodeVcsOAuthState } from "../lib/vcsOAuthState.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

export const vcsOauthGithubRouter = Router();

function redirectBase(): string {
  const base = (env.API_PUBLIC_URL ?? "").replace(/\/$/, "") || `http://127.0.0.1:${env.PORT}`;
  return `${base}/api/vcs/oauth/github/callback`;
}

vcsOauthGithubRouter.get("/start", requireAuth, requireTenant, async (req, res) => {
  const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : "";
  if (!connectionId) {
    res.status(400).json({ error: "connectionId query required" });
    return;
  }
  if (!env.VCS_GITHUB_CLIENT_ID || !env.VCS_GITHUB_CLIENT_SECRET) {
    res.status(503).json({ error: "GitHub VCS OAuth is not configured (VCS_GITHUB_CLIENT_ID / SECRET)." });
    return;
  }
  const tenantId = getTenantId(req);
  const conn = await prismaUnscoped.repositoryConnection.findFirst({
    where: { id: connectionId, tenantId }
  });
  if (!conn) {
    res.status(404).json({ error: "Repository connection not found" });
    return;
  }
  const state = encodeVcsOAuthState(env.SESSION_SECRET, {
    connectionId,
    tenantId,
    exp: Date.now() + 15 * 60 * 1000
  });
  const redirectUri = encodeURIComponent(redirectBase());
  const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.VCS_GITHUB_CLIENT_ID)}&scope=${encodeURIComponent("repo read:user")}&state=${encodeURIComponent(state)}&redirect_uri=${redirectUri}`;
  res.redirect(url);
});

vcsOauthGithubRouter.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !stateRaw) {
    res.status(400).send("Missing code or state");
    return;
  }
  const payload = decodeVcsOAuthState(env.SESSION_SECRET, stateRaw);
  if (!payload) {
    res.status(400).send("Invalid or expired state");
    return;
  }
  if (!env.VCS_GITHUB_CLIENT_ID || !env.VCS_GITHUB_CLIENT_SECRET) {
    res.status(503).send("OAuth not configured");
    return;
  }
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.VCS_GITHUB_CLIENT_ID,
      client_secret: env.VCS_GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectBase()
    })
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!tokenJson.access_token) {
    res.status(400).send("GitHub token exchange failed");
    return;
  }
  await prismaUnscoped.repositoryConnection.update({
    where: { id: payload.connectionId },
    data: {
      oauthAccessToken: tokenJson.access_token,
      oauthRefreshToken: tokenJson.refresh_token ?? null,
      oauthExpiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : null
    }
  });
  notifyAtlasAuxiliaryChange(payload.tenantId);
  const dest = `${env.CLIENT_URL.replace(/\/$/, "")}/sdlc?repo=connected`;
  res.redirect(dest);
});

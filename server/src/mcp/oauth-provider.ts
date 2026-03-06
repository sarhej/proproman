import crypto from "node:crypto";
import { Response } from "express";
import * as jose from "jose";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logAudit } from "../services/audit.js";
import type {
  OAuthServerProvider,
  AuthorizationParams
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest
} from "@modelcontextprotocol/sdk/shared/auth.js";

export function getMcpBaseUrl(): string {
  return env.NODE_ENV === "production"
    ? env.CLIENT_URL
    : `http://localhost:${env.PORT}`;
}

const JWT_SECRET_RAW = env.MCP_JWT_SECRET ?? env.SESSION_SECRET;
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
const TOKEN_TTL = 3600; // 1 hour
const REFRESH_TTL = 60 * 60 * 24 * 14; // 14 days

function roleForEmail(email: string): UserRole | null {
  if (email === "s@strt.vc") return UserRole.SUPER_ADMIN;
  if (email.endsWith("@drdigital.care")) return UserRole.EDITOR;
  if (email.endsWith("@ehtmedic.cz")) return UserRole.EDITOR;
  return null;
}

// --- In-memory stores (fine for single-process; swap for DB/Redis for multi-node) ---

const registeredClients = new Map<string, OAuthClientInformationFull>();

interface PendingAuth {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  googleState: string;
}

const pendingAuths = new Map<string, PendingAuth>();

interface AuthCodeEntry {
  userId: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

const refreshTokens = new Map<string, { userId: string; clientId: string; scopes: string[] }>();

// --- Client store ---

const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId: string) {
    return registeredClients.get(clientId);
  },
  registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    const clientId = crypto.randomUUID();
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000)
    } as OAuthClientInformationFull;
    registeredClients.set(clientId, full);
    return full;
  }
};

// --- User resolution (mirrors passport.ts logic) ---

async function resolveOrCreateUser(profile: { email: string; name: string; googleId: string; avatarUrl?: string }) {
  const { email, name, googleId, avatarUrl } = profile;

  const existingByGoogle = await prisma.user.findUnique({ where: { googleId } });
  if (existingByGoogle) {
    if (!existingByGoogle.isActive) throw new Error("Account deactivated.");
    await prisma.user.update({ where: { id: existingByGoogle.id }, data: { lastLoginAt: new Date() } });
    await logAudit(existingByGoogle.id, "LOGIN", "USER", existingByGoogle.id);
    return existingByGoogle;
  }

  const alias = await prisma.userEmail.findUnique({ where: { email }, include: { user: true } });
  const existingByEmail = alias?.user ?? await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    if (!existingByEmail.isActive) throw new Error("Account deactivated.");
    const linked = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { googleId, avatarUrl: avatarUrl ?? existingByEmail.avatarUrl, lastLoginAt: new Date() }
    });
    const hasAlias = await prisma.userEmail.findUnique({ where: { email } });
    if (!hasAlias) await prisma.userEmail.create({ data: { email, userId: linked.id, isPrimary: linked.email === email } });
    await logAudit(linked.id, "LOGIN", "USER", linked.id);
    return linked;
  }

  const autoRole = roleForEmail(email) ?? UserRole.PENDING;
  const created = await prisma.user.create({
    data: {
      email, name, avatarUrl, googleId, role: autoRole, lastLoginAt: new Date(),
      emails: { create: { email, isPrimary: true } }
    }
  });
  await logAudit(created.id, "CREATED", "USER", created.id, { firstLogin: true, autoRole, pending: autoRole === UserRole.PENDING });
  return created;
}

// --- JWT helpers ---

async function mintAccessToken(userId: string, role: string, clientId: string, scopes: string[]): Promise<string> {
  return new jose.SignJWT({ userId, role, clientId, scopes })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL}s`)
    .setSubject(userId)
    .sign(JWT_SECRET);
}

async function mintRefreshToken(userId: string, clientId: string, scopes: string[]): Promise<string> {
  const token = crypto.randomUUID();
  refreshTokens.set(token, { userId, clientId, scopes });
  return token;
}

async function verifyJwt(token: string): Promise<jose.JWTPayload & { userId: string; role: string; clientId: string; scopes: string[] }> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET);
  return payload as jose.JWTPayload & { userId: string; role: string; clientId: string; scopes: string[] };
}

// --- The provider ---

export class DrdOAuthProvider implements OAuthServerProvider {
  skipLocalPkceValidation = false;

  get clientsStore(): OAuthRegisteredClientsStore {
    return clientsStore;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      res.status(503).send("Google OAuth not configured");
      return;
    }

    const googleState = crypto.randomUUID();

    pendingAuths.set(googleState, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
      scopes: params.scopes,
      googleState
    });

    const googleCallbackUrl = `${getMcpBaseUrl()}/mcp-oauth/google/callback`;

    const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    googleUrl.searchParams.set("redirect_uri", googleCallbackUrl);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", "openid email profile");
    googleUrl.searchParams.set("state", googleState);
    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "consent");

    res.redirect(googleUrl.toString());
  }

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const entry = authCodes.get(authorizationCode);
    return entry?.codeChallenge ?? "";
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const entry = authCodes.get(authorizationCode);
    if (!entry) throw new Error("Invalid authorization code");
    if (Date.now() - entry.createdAt > 5 * 60 * 1000) {
      authCodes.delete(authorizationCode);
      throw new Error("Authorization code expired");
    }
    if (entry.clientId !== client.client_id) throw new Error("Client mismatch");

    authCodes.delete(authorizationCode);

    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (!user || !user.isActive) throw new Error("User not found or inactive");

    const accessToken = await mintAccessToken(user.id, user.role, client.client_id, entry.scopes);
    const refreshToken = await mintRefreshToken(user.id, client.client_id, entry.scopes);

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL,
      refresh_token: refreshToken
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const entry = refreshTokens.get(refreshToken);
    if (!entry || entry.clientId !== client.client_id) throw new Error("Invalid refresh token");

    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (!user || !user.isActive) throw new Error("User not found or inactive");

    const effectiveScopes = scopes ?? entry.scopes;
    const accessToken = await mintAccessToken(user.id, user.role, client.client_id, effectiveScopes);
    const newRefreshToken = await mintRefreshToken(user.id, client.client_id, effectiveScopes);

    refreshTokens.delete(refreshToken);

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL,
      refresh_token: newRefreshToken
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const payload = await verifyJwt(token);
    return {
      token,
      clientId: payload.clientId,
      scopes: payload.scopes ?? [],
      expiresAt: payload.exp,
      extra: { userId: payload.userId, role: payload.role }
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    refreshTokens.delete(request.token);
  }
}

// --- Google callback handler (called by Express, not the MCP SDK) ---

export async function handleGoogleCallback(code: string, state: string): Promise<{ redirectUri: string }> {
  const pending = pendingAuths.get(state);
  if (!pending) throw new Error("Invalid state parameter");
  pendingAuths.delete(state);

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth not configured");

  const googleCallbackUrl = `${getMcpBaseUrl()}/mcp-oauth/google/callback`;

  // Exchange Google auth code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleCallbackUrl,
      grant_type: "authorization_code"
    })
  });

  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  const tokens = await tokenRes.json() as { id_token?: string; access_token: string };

  // Get user info from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!userInfoRes.ok) throw new Error(`Google userinfo failed: ${userInfoRes.status}`);
  const userInfo = await userInfoRes.json() as { id: string; email: string; name: string; picture?: string };

  const user = await resolveOrCreateUser({
    email: userInfo.email,
    name: userInfo.name,
    googleId: userInfo.id,
    avatarUrl: userInfo.picture
  });

  // Mint our own auth code and redirect back to the MCP client
  const ourCode = crypto.randomUUID();
  authCodes.set(ourCode, {
    userId: user.id,
    clientId: pending.clientId,
    codeChallenge: pending.codeChallenge,
    redirectUri: pending.redirectUri,
    scopes: pending.scopes ?? [],
    createdAt: Date.now()
  });

  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set("code", ourCode);
  if (pending.state) redirectUrl.searchParams.set("state", pending.state);

  return { redirectUri: redirectUrl.toString() };
}

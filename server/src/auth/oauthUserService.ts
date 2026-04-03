import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { logAudit } from "../services/audit.js";
import { autoRoleForGoogleEmail } from "./googleAutoRole.js";

export type OAuthProvider = "google" | "microsoft";

export type ResolveOAuthUserParams = {
  provider: OAuthProvider;
  /** Provider's stable user id (Google `sub` / Microsoft `id`). */
  providerUserId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

/**
 * Single implementation for OAuth sign-in: find by provider id, link by email alias, or create user.
 * Used by Passport (browser) and MCP Google callback.
 */
export async function resolveOrCreateOAuthUser(params: ResolveOAuthUserParams): Promise<User> {
  const { provider, providerUserId, email, name, avatarUrl } = params;

  if (provider === "microsoft") {
    return resolveMicrosoftUser(params);
  }

  if (provider !== "google") {
    throw new Error(`Unsupported OAuth provider: ${String(provider)}`);
  }

  const existingByGoogle = await prisma.user.findUnique({
    where: { googleId: providerUserId }
  });

  if (existingByGoogle) {
    if (!existingByGoogle.isActive) {
      throw new Error("Account deactivated. Contact an administrator.");
    }
    await prisma.user.update({
      where: { id: existingByGoogle.id },
      data: { lastLoginAt: new Date() }
    });
    await logAudit(existingByGoogle.id, "LOGIN", "USER", existingByGoogle.id);
    return existingByGoogle;
  }

  const alias = await prisma.userEmail.findUnique({
    where: { email },
    include: { user: true }
  });
  const existingByEmail = alias?.user ?? (await prisma.user.findUnique({ where: { email } }));

  if (existingByEmail) {
    if (!existingByEmail.isActive) {
      throw new Error("Account deactivated. Contact an administrator.");
    }
    const linked = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleId: providerUserId,
        avatarUrl: avatarUrl ?? existingByEmail.avatarUrl,
        lastLoginAt: new Date()
      }
    });
    const hasAlias = await prisma.userEmail.findUnique({ where: { email } });
    if (!hasAlias) {
      await prisma.userEmail.create({
        data: { email, userId: linked.id, isPrimary: linked.email === email }
      });
    }
    await logAudit(linked.id, "LOGIN", "USER", linked.id);
    return linked;
  }

  const autoRole = autoRoleForGoogleEmail(email) ?? UserRole.PENDING;

  const created = await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0] || "User",
      avatarUrl: avatarUrl ?? undefined,
      googleId: providerUserId,
      role: autoRole,
      lastLoginAt: new Date(),
      emails: { create: { email, isPrimary: true } }
    }
  });

  await logAudit(created.id, "CREATED", "USER", created.id, {
    firstLogin: true,
    autoRole,
    pending: autoRole === UserRole.PENDING
  });
  return created;
}

/** Microsoft branch — requires `User.microsoftId` (added in same release as Passport Microsoft strategy). */
async function resolveMicrosoftUser(params: ResolveOAuthUserParams): Promise<User> {
  const { providerUserId, email, name, avatarUrl } = params;

  const existingByMs = await prisma.user.findUnique({
    where: { microsoftId: providerUserId }
  });

  if (existingByMs) {
    if (!existingByMs.isActive) {
      throw new Error("Account deactivated. Contact an administrator.");
    }
    await prisma.user.update({
      where: { id: existingByMs.id },
      data: { lastLoginAt: new Date() }
    });
    await logAudit(existingByMs.id, "LOGIN", "USER", existingByMs.id);
    return existingByMs;
  }

  const alias = await prisma.userEmail.findUnique({
    where: { email },
    include: { user: true }
  });
  const existingByEmail = alias?.user ?? (await prisma.user.findUnique({ where: { email } }));

  if (existingByEmail) {
    if (!existingByEmail.isActive) {
      throw new Error("Account deactivated. Contact an administrator.");
    }
    const linked = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        microsoftId: providerUserId,
        avatarUrl: avatarUrl ?? existingByEmail.avatarUrl,
        lastLoginAt: new Date()
      }
    });
    const hasAlias = await prisma.userEmail.findUnique({ where: { email } });
    if (!hasAlias) {
      await prisma.userEmail.create({
        data: { email, userId: linked.id, isPrimary: linked.email === email }
      });
    }
    await logAudit(linked.id, "LOGIN", "USER", linked.id);
    return linked;
  }

  const autoRole = autoRoleForGoogleEmail(email) ?? UserRole.PENDING;

  const created = await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0] || "User",
      avatarUrl: avatarUrl ?? undefined,
      microsoftId: providerUserId,
      role: autoRole,
      lastLoginAt: new Date(),
      emails: { create: { email, isPrimary: true } }
    }
  });

  await logAudit(created.id, "CREATED", "USER", created.id, {
    firstLogin: true,
    autoRole,
    pending: autoRole === UserRole.PENDING
  });
  return created;
}

/**
 * Email magic link: find user by alias/primary email, or create with default role (no OAuth ids).
 */
export async function resolveOrCreateUserFromEmailMagicLink(normalizedEmail: string): Promise<User> {
  const email = normalizedEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Invalid email.");
  }

  const alias = await prisma.userEmail.findUnique({
    where: { email },
    include: { user: true }
  });
  const existing = alias?.user ?? (await prisma.user.findUnique({ where: { email } }));

  if (existing) {
    if (!existing.isActive) {
      throw new Error("Account deactivated. Contact an administrator.");
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { lastLoginAt: new Date() }
    });
    await logAudit(existing.id, "LOGIN", "USER", existing.id);
    return existing;
  }

  const autoRole = autoRoleForGoogleEmail(email) ?? UserRole.PENDING;
  const localPart = email.split("@")[0] ?? "User";
  const created = await prisma.user.create({
    data: {
      email,
      name: localPart,
      role: autoRole,
      lastLoginAt: new Date(),
      emails: { create: { email, isPrimary: true } }
    }
  });
  await logAudit(created.id, "CREATED", "USER", created.id, {
    firstLogin: true,
    autoRole,
    pending: autoRole === UserRole.PENDING
  });
  return created;
}

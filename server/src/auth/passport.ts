import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logAudit } from "../services/audit.js";

function roleForEmail(email: string): UserRole | null {
  if (email === "s@strt.vc") return UserRole.SUPER_ADMIN;
  if (email.endsWith("@drdigital.care")) return UserRole.EDITOR;
  if (email.endsWith("@ehtmedic.cz")) return UserRole.EDITOR;
  return null;
}

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      console.log("[auth] deserializeUser no user for id", id?.slice(0, 8));
    }
    done(null, user ?? false);
  } catch (error) {
    console.error("[auth] deserializeUser error", (error as Error)?.message ?? error);
    done(error);
  }
});

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL
      },
      async (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("Google account does not have an email."));
          }

          const existingByGoogle = await prisma.user.findUnique({
            where: { googleId: profile.id }
          });

          if (existingByGoogle) {
            if (!existingByGoogle.isActive) {
              return done(new Error("Account deactivated. Contact an administrator."));
            }
            await prisma.user.update({
              where: { id: existingByGoogle.id },
              data: { lastLoginAt: new Date() }
            });
            await logAudit(existingByGoogle.id, "LOGIN", "USER", existingByGoogle.id);
            return done(null, existingByGoogle);
          }

          // Look up by email alias table first, then fall back to User.email
          const alias = await prisma.userEmail.findUnique({
            where: { email },
            include: { user: true }
          });
          const existingByEmail = alias?.user
            ?? await prisma.user.findUnique({ where: { email } });

          if (existingByEmail) {
            if (!existingByEmail.isActive) {
              return done(new Error("Account deactivated. Contact an administrator."));
            }
            const linked = await prisma.user.update({
              where: { id: existingByEmail.id },
              data: {
                googleId: profile.id,
                avatarUrl: profile.photos?.[0]?.value ?? existingByEmail.avatarUrl,
                lastLoginAt: new Date()
              }
            });
            // Ensure this email exists in the alias table
            const hasAlias = await prisma.userEmail.findUnique({ where: { email } });
            if (!hasAlias) {
              await prisma.userEmail.create({
                data: { email, userId: linked.id, isPrimary: linked.email === email }
              });
            }
            await logAudit(linked.id, "LOGIN", "USER", linked.id);
            return done(null, linked);
          }

          const autoRole = roleForEmail(email) ?? UserRole.PENDING;

          const created = await prisma.user.create({
            data: {
              email,
              name: profile.displayName || email.split("@")[0] || "User",
              avatarUrl: profile.photos?.[0]?.value,
              googleId: profile.id,
              role: autoRole,
              lastLoginAt: new Date(),
              emails: { create: { email, isPrimary: true } }
            }
          });

          await logAudit(created.id, "CREATED", "USER", created.id, {
            firstLogin: true,
            autoRole: autoRole,
            pending: autoRole === UserRole.PENDING,
          });
          return done(null, created);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

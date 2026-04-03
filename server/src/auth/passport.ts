import passport from "passport";
import OAuth2Strategy from "passport-oauth2";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { resolveOrCreateOAuthUser } from "./oauthUserService.js";

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

          const user = await resolveOrCreateOAuthUser({
            provider: "google",
            providerUserId: profile.id,
            email,
            name: profile.displayName || email.split("@")[0] || "User",
            avatarUrl: profile.photos?.[0]?.value
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

if (
  env.MICROSOFT_CLIENT_ID &&
  env.MICROSOFT_CLIENT_SECRET &&
  env.MICROSOFT_CALLBACK_URL
) {
  passport.use(
    "microsoft",
    new OAuth2Strategy(
      {
        authorizationURL: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenURL: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        clientID: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        callbackURL: env.MICROSOFT_CALLBACK_URL,
        scope: ["openid", "profile", "email", "User.Read"].join(" "),
        state: true,
        skipUserProfile: true
      },
      async (
        accessToken: string,
        _refreshToken: string,
        _profile: unknown,
        done: (err: Error | null, user?: Express.User | false) => void
      ) => {
        try {
          const graphRes = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!graphRes.ok) {
            return done(new Error(`Microsoft Graph failed: ${graphRes.status}`));
          }
          const me = (await graphRes.json()) as {
            id: string;
            mail?: string | null;
            userPrincipalName?: string;
            displayName?: string;
          };
          const emailRaw = me.mail || me.userPrincipalName;
          if (!emailRaw || !me.id) {
            return done(new Error("Microsoft account does not have a usable email."));
          }
          const email = emailRaw.trim();
          if (!email.includes("@")) {
            return done(new Error("Microsoft account email is not in a recognized format."));
          }
          const user = await resolveOrCreateOAuthUser({
            provider: "microsoft",
            providerUserId: me.id,
            email,
            name: me.displayName?.trim() || email.split("@")[0] || "User",
            avatarUrl: null
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

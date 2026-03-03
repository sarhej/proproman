import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { prisma } from "../db.js";
import { env } from "../env.js";

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user ?? false);
  } catch (error) {
    done(error);
  }
});

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
          return done(null, existingByGoogle);
        }

        const existingByEmail = await prisma.user.findUnique({
          where: { email }
        });

        if (existingByEmail) {
          const linked = await prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              googleId: profile.id,
              avatarUrl: profile.photos?.[0]?.value ?? existingByEmail.avatarUrl
            }
          });
          return done(null, linked);
        }

        const created = await prisma.user.create({
          data: {
            email,
            name: profile.displayName || email.split("@")[0] || "User",
            avatarUrl: profile.photos?.[0]?.value,
            googleId: profile.id
          }
        });

        return done(null, created);
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

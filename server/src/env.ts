import dotenv from "dotenv";
import { UserRole } from "@prisma/client";
import { z } from "zod";

dotenv.config();

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value;
}, z.string().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("8080"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(12),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALLBACK_URL: optionalString,
  CLIENT_URL: z.string().default("http://localhost:5173"),
  ALLOW_DEV_AUTH: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  DEV_AUTH_EMAIL: z.string().default("s@strt.vc"),
  DEV_AUTH_NAME: z.string().default("Sergei"),
  DEV_AUTH_ROLE: z.nativeEnum(UserRole).default(UserRole.SUPER_ADMIN)
});

export const env = envSchema
  .superRefine((value, ctx) => {
    const usingDevAuthFallback = value.NODE_ENV !== "production" && value.ALLOW_DEV_AUTH;
    if (!usingDevAuthFallback) {
      if (!value.GOOGLE_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GOOGLE_CLIENT_ID"],
          message: "Required unless ALLOW_DEV_AUTH=true in non-production."
        });
      }
      if (!value.GOOGLE_CLIENT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GOOGLE_CLIENT_SECRET"],
          message: "Required unless ALLOW_DEV_AUTH=true in non-production."
        });
      }
      if (!value.GOOGLE_CALLBACK_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GOOGLE_CALLBACK_URL"],
          message: "Required unless ALLOW_DEV_AUTH=true in non-production."
        });
      }
    }
  })
  .parse(process.env);

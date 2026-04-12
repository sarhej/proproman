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
  MICROSOFT_CLIENT_ID: optionalString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_CALLBACK_URL: optionalString,
  CLIENT_URL: z.string().default("http://localhost:5173"),
  ALLOW_DEV_AUTH: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  DEV_AUTH_EMAIL: z.string().default("s@strt.vc"),
  DEV_AUTH_NAME: z.string().default("Sergei"),
  DEV_AUTH_ROLE: z.nativeEnum(UserRole).default(UserRole.SUPER_ADMIN),
  /** Optional: when set, requests with Authorization: Bearer <API_KEY> are authenticated (e.g. for MCP). */
  API_KEY: optionalString,
  /** Optional: user ID to impersonate when API_KEY is used. If unset, first SUPER_ADMIN is used. */
  API_KEY_USER_ID: optionalString,
  /** Secret for signing MCP OAuth JWT tokens. Falls back to SESSION_SECRET if not set. */
  MCP_JWT_SECRET: optionalString,
  /** Audit notification emails via Resend: default on; set NOTIFICATION_EMAIL_ENABLED=false to disable. */
  NOTIFICATION_EMAIL_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  /** Notification delivery: when "true", attempt to send via Slack (placeholder; no integration yet). */
  NOTIFICATION_SLACK_ENABLED: z.string().optional().transform((v) => v === "true"),
  /** Notification delivery: when "true", attempt to send via WhatsApp (placeholder; no integration yet). */
  NOTIFICATION_WHATSAPP_ENABLED: z.string().optional().transform((v) => v === "true"),
  /** Slug for the reserved Tymio product workspace (feedback hub). Default: tymio */
  TYMI_SYSTEM_TENANT_SLUG: z.string().min(2).max(50).default("tymio"),
  /** Optional: override MCP footer text for “how to report feedback” (otherwise built from CLIENT_URL + system workspace slug). */
  MCP_FEEDBACK_INSTRUCTIONS: optionalString,
  /** Resend API key (https://resend.com) for magic-link email. */
  RESEND_API_KEY: optionalString,
  /** Verified sender in Resend, e.g. onboarding@resend.dev or noreply@yourdomain.com */
  RESEND_FROM: optionalString,
  /** Public origin of this API (for magic-link URLs). Defaults to http://127.0.0.1:PORT in development. */
  API_PUBLIC_URL: optionalString,
  EMAIL_MAGIC_LINK_TTL_MINUTES: z.preprocess(
    (val) => (val === undefined || val === "" ? "30" : val),
    z.coerce.number().int().min(5).max(120)
  ),
  /**
   * E1–E4 and Resend-backed sends: explicit false disables even when API key is set.
   * Unset: send whenever RESEND_API_KEY + From are configured.
   */
  TRANSACTIONAL_EMAIL_ENABLED: z
    .string()
    .optional()
    .transform((v): boolean | null => {
      if (v === undefined || typeof v !== "string" || v.trim() === "") return null;
      const s = v.trim().toLowerCase();
      if (s === "false" || s === "0" || s === "no") return false;
      if (s === "true" || s === "1" || s === "yes") return true;
      return null;
    }),
  /**
   * Temporary onboarding: after POST /api/tenant-requests, immediately provision the workspace (no SUPER_ADMIN review).
   * Set to false or unset when manual approval is required again.
   */
  AUTO_APPROVE_WORKSPACE_REQUESTS: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || typeof v !== "string") return false;
      const s = v.trim().toLowerCase();
      return s === "true" || s === "1" || s === "yes" || s === "on";
    }),
  /** Optional: directory for compiled workspace-atlas + object shards (default: server/data/workspace-atlas). */
  WORKSPACE_ATLAS_DATA_DIR: optionalString,
  /** Debounce (ms) before rebuilding atlas after hub change events. */
  WORKSPACE_ATLAS_DEBOUNCE_MS: z.preprocess(
    (val) => (val === undefined || val === "" ? "2000" : val),
    z.coerce.number().int().min(200).max(120_000)
  ),
  /** When true, optional LLM features (explain) may call OpenAI if WORKSPACE_ATLAS_OPENAI_API_KEY is set. */
  WORKSPACE_ATLAS_LLM_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1" || v === "yes"),
  WORKSPACE_ATLAS_OPENAI_API_KEY: optionalString,
  WORKSPACE_ATLAS_OPENAI_MODEL: z.string().default("gpt-4o-mini")
});

export const env = envSchema
  .superRefine((value, ctx) => {
    const usingDevAuthFallback = value.NODE_ENV !== "production" && value.ALLOW_DEV_AUTH;
    const hasGoogle =
      !!value.GOOGLE_CLIENT_ID && !!value.GOOGLE_CLIENT_SECRET && !!value.GOOGLE_CALLBACK_URL;
    const hasMicrosoft =
      !!value.MICROSOFT_CLIENT_ID &&
      !!value.MICROSOFT_CLIENT_SECRET &&
      !!value.MICROSOFT_CALLBACK_URL;
    const hasEmailMagicLink = !!value.RESEND_API_KEY && !!value.RESEND_FROM;
    if (!usingDevAuthFallback && !hasGoogle && !hasMicrosoft && !hasEmailMagicLink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_CLIENT_ID"],
        message:
          "Set Google and/or Microsoft OAuth, or Resend (RESEND_API_KEY + RESEND_FROM) for email magic link, or ALLOW_DEV_AUTH=true in non-production."
      });
    }
  })
  .parse(process.env);

import { Resend } from "resend";
import { env } from "../env.js";

let warnedMissingConfig = false;

export function isTransactionalEmailEnabled(): boolean {
  return env.TRANSACTIONAL_EMAIL_ENABLED === true;
}

export function isTransactionalEmailReady(): boolean {
  return !!(env.RESEND_API_KEY && getTransactionalFrom());
}

export function getTransactionalFrom(): string | undefined {
  if (env.RESEND_FROM) return env.RESEND_FROM;
  if (env.NODE_ENV !== "production") {
    return "onboarding@resend.dev";
  }
  return undefined;
}

export type SendTransactionalEmailArgs = {
  to: string | string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  tags?: { name: string; value: string }[];
};

export async function sendTransactionalEmail(args: SendTransactionalEmailArgs): Promise<void> {
  if (!isTransactionalEmailEnabled()) {
    return;
  }
  const from = getTransactionalFrom();
  if (!env.RESEND_API_KEY || !from) {
    if (env.NODE_ENV === "development" && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        "[transactional-email] Skipping send: RESEND_API_KEY missing or no From address configured."
      );
    }
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    cc: args.cc && args.cc.length > 0 ? args.cc : undefined,
    subject: args.subject,
    text: args.text,
    html: args.html,
    tags: args.tags,
  });

  if (error) {
    throw new Error(error.message ?? "Resend send failed");
  }
}

export function logTransactionalEmail(
  event: string,
  fields: Record<string, string | number | boolean | undefined>
): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "boolean" ? String(v) : v}`);
  console.log(`[transactional-email] event=${event} ${parts.join(" ")}`);
}

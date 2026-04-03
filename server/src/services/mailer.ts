import { Resend } from "resend";
import { env } from "../env.js";

/** Magic-link email is available when Resend is configured. */
export function isMagicLinkEmailConfigured(): boolean {
  return !!(env.RESEND_API_KEY && env.RESEND_FROM);
}

/** Origin for links in emails (Express public URL). */
export function getMagicLinkVerifyBaseUrl(): string {
  if (env.API_PUBLIC_URL) return env.API_PUBLIC_URL.replace(/\/$/, "");
  if (env.NODE_ENV !== "production") {
    return `http://127.0.0.1:${env.PORT}`;
  }
  return env.CLIENT_URL.replace(/\/$/, "");
}

export async function sendMagicLinkEmail(to: string, verifyUrl: string): Promise<void> {
  if (!isMagicLinkEmailConfigured()) {
    throw new Error("Resend is not configured (RESEND_API_KEY and RESEND_FROM).");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const subject = "Your Tymio sign-in link";
  const text = `Sign in to Tymio:\n\n${verifyUrl}\n\nThis link expires in ${env.EMAIL_MAGIC_LINK_TTL_MINUTES} minutes. If you did not request this, ignore this email.`;
  const html = `<p>Sign in to Tymio:</p><p><a href="${verifyUrl.replace(/"/g, "&quot;")}">Click here to sign in</a></p><p>This link expires in ${env.EMAIL_MAGIC_LINK_TTL_MINUTES} minutes.</p>`;

  const { error } = await resend.emails.send({
    from: env.RESEND_FROM!,
    to,
    subject,
    text,
    html
  });

  if (error) {
    throw new Error(error.message ?? "Resend send failed");
  }
}

import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

const envForMail = vi.hoisted(() => ({
  NODE_ENV: "test" as const,
  RESEND_API_KEY: "re_test" as string | undefined,
  RESEND_FROM: "Tymio <onboarding@resend.dev>" as string | undefined,
  TRANSACTIONAL_EMAIL_ENABLED: null as boolean | null,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("../env.js", () => ({
  env: envForMail,
}));

import { sendTransactionalEmail } from "./transactionalMail.js";

describe("transactionalMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: {}, error: null });
    envForMail.RESEND_API_KEY = "re_test";
    envForMail.RESEND_FROM = "Tymio <onboarding@resend.dev>";
    envForMail.TRANSACTIONAL_EMAIL_ENABLED = null;
  });

  it("sendTransactionalEmail forwards to Resend when Resend is configured (flag unset)", async () => {
    envForMail.TRANSACTIONAL_EMAIL_ENABLED = null;
    await sendTransactionalEmail({
      to: "a@b.co",
      cc: ["c@b.co"],
      subject: "S",
      text: "T",
      html: "<p>T</p>",
      tags: [{ name: "event", value: "E1" }],
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Tymio <onboarding@resend.dev>",
        to: "a@b.co",
        cc: ["c@b.co"],
        subject: "S",
        tags: [{ name: "event", value: "E1" }],
      })
    );
  });

  it("sendTransactionalEmail no-ops when TRANSACTIONAL_EMAIL_ENABLED is false", async () => {
    envForMail.TRANSACTIONAL_EMAIL_ENABLED = false;
    await sendTransactionalEmail({
      to: "a@b.co",
      subject: "S",
      text: "T",
      html: "<p>T</p>",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sendTransactionalEmail no-ops when Resend is not configured", async () => {
    envForMail.RESEND_API_KEY = undefined;
    await sendTransactionalEmail({
      to: "a@b.co",
      subject: "S",
      text: "T",
      html: "<p>T</p>",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

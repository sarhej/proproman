import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("../env.js", () => ({
  env: {
    NODE_ENV: "test" as const,
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "Tymio <onboarding@resend.dev>",
    TRANSACTIONAL_EMAIL_ENABLED: true,
  },
}));

import { sendTransactionalEmail } from "./transactionalMail.js";

describe("transactionalMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: {}, error: null });
  });

  it("sendTransactionalEmail forwards to Resend when enabled and configured", async () => {
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
});

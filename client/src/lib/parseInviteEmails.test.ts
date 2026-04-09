import { describe, expect, it } from "vitest";
import { parseInviteEmailsFromText } from "./parseInviteEmails";

describe("parseInviteEmailsFromText", () => {
  it("splits on comma newline and semicolon", () => {
    expect(parseInviteEmailsFromText("a@b.com, c@d.com\nE@F.COM")).toEqual(["a@b.com", "c@d.com", "E@F.COM"]);
  });

  it("dedupes case-insensitively", () => {
    expect(parseInviteEmailsFromText("a@b.com\nA@b.com")).toEqual(["a@b.com"]);
  });

  it("caps at 20 by default", () => {
    const list = Array.from({ length: 25 }, (_, i) => `u${i}@x.com`).join("\n");
    expect(parseInviteEmailsFromText(list)).toHaveLength(20);
  });
});

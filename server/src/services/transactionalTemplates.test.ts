import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildE1NewWorkspaceRequestEmail,
  buildE2WorkspaceApprovedEmail,
  buildE3WorkspaceRejectedEmail,
  buildE4PlatformRoleActivatedEmail,
  escapeHtml,
  normalizeTransactionalLocale,
} from "./transactionalTemplates.js";

vi.mock("../env.js", () => ({
  env: { CLIENT_URL: "https://app.example.com/" },
}));

describe("transactionalTemplates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("escapeHtml escapes special characters", () => {
    expect(escapeHtml(`a<b>"c"&`)).toBe("a&lt;b&gt;&quot;c&quot;&amp;");
  });

  it("normalizeTransactionalLocale falls back to en", () => {
    expect(normalizeTransactionalLocale(undefined)).toBe("en");
    expect(normalizeTransactionalLocale("fr")).toBe("en");
    expect(normalizeTransactionalLocale("cs-CZ")).toBe("cs");
  });

  it("buildE1 includes team and escaped slug in html", () => {
    const { subject, html } = buildE1NewWorkspaceRequestEmail({
      locale: "en",
      teamName: 'Acme <Inc>',
      slug: "acme",
      contactEmail: "a@b.co",
      contactName: "Jane",
      requestId: "req1",
    });
    expect(subject).toContain("Acme");
    expect(html).toContain("Acme &lt;Inc&gt;");
    expect(html).toContain("req1");
    expect(html).toContain("Tymio App");
  });

  it("buildE2 includes workspace link with encoded slug", () => {
    const { html, text } = buildE2WorkspaceApprovedEmail({
      locale: "en",
      teamName: "Team",
      slug: "a/b",
    });
    expect(text).toContain("/t/a%2Fb");
    expect(html).toContain(encodeURIComponent("a/b"));
  });

  it("buildE3 uses generic copy when note missing", () => {
    const { text } = buildE3WorkspaceRejectedEmail({
      locale: "en",
      teamName: "T",
      slug: "s",
      reviewNote: null,
    });
    expect(text).toContain("not approved");
    expect(text).not.toContain("Note from the reviewer");
  });

  it("buildE3 includes note when present and escapes html", () => {
    const { html } = buildE3WorkspaceRejectedEmail({
      locale: "en",
      teamName: "T",
      slug: "s",
      reviewNote: "<script>x</script>",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("buildE4 includes sign-in base url", () => {
    const { text } = buildE4PlatformRoleActivatedEmail({ name: "Pat" });
    expect(text).toContain("https://app.example.com/");
    expect(text).toContain("Pat");
  });
});

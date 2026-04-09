import { describe, expect, it } from "vitest";
import {
  domainPartFromEmail,
  isBlockedConsumerOrHostedEmailDomain,
  trustedBusinessDomainFromEmail,
} from "./emailDomainPolicy.js";

describe("emailDomainPolicy", () => {
  it("domainPartFromEmail returns domain lowercased", () => {
    expect(domainPartFromEmail("Jane@Acme.COM")).toBe("acme.com");
  });

  it("trustedBusinessDomainFromEmail returns domain for work email", () => {
    expect(trustedBusinessDomainFromEmail("jane@acme.com")).toBe("acme.com");
  });

  it("trustedBusinessDomainFromEmail returns null for gmail", () => {
    expect(trustedBusinessDomainFromEmail("jane@gmail.com")).toBeNull();
  });

  it("trustedBusinessDomainFromEmail returns null for onmicrosoft", () => {
    expect(trustedBusinessDomainFromEmail("jane@contoso.onmicrosoft.com")).toBeNull();
  });

  it("isBlockedConsumerOrHostedEmailDomain blocks consumer set", () => {
    expect(isBlockedConsumerOrHostedEmailDomain("gmail.com")).toBe(true);
    expect(isBlockedConsumerOrHostedEmailDomain("acme.com")).toBe(false);
  });
});

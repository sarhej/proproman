import { describe, expect, it } from "vitest";
import {
  schemaOrgPublisherOrganization,
  schemaOrgTymioWebApplicationAbout,
  schemaOrgWebSitePart,
} from "./schemaOrgTymio";

describe("schemaOrgTymio", () => {
  const origin = "https://tymio.app";

  it("publisher matches Organization + logo URL", () => {
    expect(schemaOrgPublisherOrganization(origin)).toEqual({
      "@type": "Organization",
      name: "Tymio",
      url: origin,
      logo: { "@type": "ImageObject", url: `${origin}/logo.png` },
    });
  });

  it("WebSite part uses stable @id", () => {
    expect(schemaOrgWebSitePart(origin)).toMatchObject({
      "@type": "WebSite",
      "@id": "https://tymio.app/#website",
      name: "Tymio",
      url: origin,
    });
  });

  it("about WebApplication is minimal", () => {
    expect(schemaOrgTymioWebApplicationAbout(origin)).toEqual({
      "@type": "WebApplication",
      name: "Tymio",
      url: origin,
    });
  });
});

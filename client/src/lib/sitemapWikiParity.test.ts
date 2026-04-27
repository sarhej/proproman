import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../../public");

describe("public/sitemap.xml vs wiki index", () => {
  it("lists every wiki article slug from public/wiki/index.json", () => {
    const index = JSON.parse(readFileSync(path.join(publicDir, "wiki/index.json"), "utf8")) as {
      pages: Array<{ slug: string }>;
    };
    const sitemap = readFileSync(path.join(publicDir, "sitemap.xml"), "utf8");
    for (const { slug } of index.pages) {
      expect(sitemap).toContain(`<loc>https://tymio.app/wiki/${slug}</loc>`);
    }
  });
});

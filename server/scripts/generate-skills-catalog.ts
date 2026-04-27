/**
 * Reads each .cursor/skills/tymio-* /SKILL.md and writes server/src/generated/skillsCatalog.json.
 * Run: npm run generate-skills-catalog --workspace server
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const repoRoot = path.join(serverRoot, "..");
const skillsRoot = path.join(repoRoot, ".cursor", "skills");
const outFile = path.join(serverRoot, "src", "generated", "skillsCatalog.json");

function extractDescription(body: string): string {
  const lines = body.split("\n");
  for (const line of lines) {
    const t = line.replace(/^#+\s*/, "").trim();
    if (t) return t.length > 220 ? `${t.slice(0, 217)}...` : t;
  }
  return "Tymio agent skill";
}

function parseSkillMarkdown(raw: string): { version: string; description: string; body: string } {
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---\n", 4);
    if (end !== -1) {
      const fm = raw.slice(4, end);
      const body = raw.slice(end + 5);
      let version = "1.0.0";
      let description = "";
      for (const line of fm.split("\n")) {
        const vm = line.match(/^version:\s*(.+)/);
        if (vm) version = vm[1]!.trim().replace(/^["']|["']$/g, "");
        const dm = line.match(/^description:\s*(.+)/);
        if (dm) description = dm[1]!.trim().replace(/^["']|["']$/g, "");
      }
      if (!description || /^[>|][-0-9]*$/.test(description.trim())) {
        description = extractDescription(body);
      }
      return { version, description, body };
    }
  }
  return { version: "1.0.0", description: extractDescription(raw), body: raw };
}

function main(): void {
  if (!fs.existsSync(skillsRoot)) {
    console.error("Missing .cursor/skills — run from monorepo with skills checked out.");
    process.exit(1);
  }
  const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  const skills: {
    id: string;
    version: string;
    sha256: string;
    description: string;
    body: string;
  }[] = [];

  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith("tymio-")) continue;
    const skillMd = path.join(skillsRoot, ent.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    const raw = fs.readFileSync(skillMd, "utf8");
    const { version, description, body } = parseSkillMarkdown(raw);
    const sha256 = createHash("sha256").update(body, "utf8").digest("hex");
    skills.push({
      id: ent.name,
      version,
      sha256,
      description,
      body
    });
  }

  skills.sort((a, b) => a.id.localeCompare(b.id));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    skills
  };
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${skills.length} skills to ${path.relative(repoRoot, outFile)}`);
}

main();

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function candidatePaths(): string[] {
  return [
    path.resolve(process.cwd(), "docs/CODING_AGENT_TYMIO.md"),
    path.resolve(process.cwd(), "..", "docs", "CODING_AGENT_TYMIO.md"),
    path.resolve(__dirname, "../../../docs/CODING_AGENT_TYMIO.md"),
    path.resolve(__dirname, "../../../../docs/CODING_AGENT_TYMIO.md")
  ];
}

/** Full Markdown text of the coding-agent playbook, or throws if no file is found. */
export async function readCodingAgentGuide(): Promise<string> {
  for (const p of candidatePaths()) {
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error("CODING_AGENT_TYMIO.md not found on server (expected under docs/ in the deployment image).");
}

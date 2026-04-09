import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_INSTRUCTIONS } from "./cliMessages.js";

const PERSONA_IDS = ["pm", "po", "dev", "workspace"] as const;

export type PersonaId = (typeof PERSONA_IDS)[number];

function personasDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "personas");
}

/** `hub` is an alias for `workspace` (base hub agent behavior). */
export function normalizePersonaId(raw: string | undefined): PersonaId | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === "hub") return "workspace";
  if ((PERSONA_IDS as readonly string[]).includes(s)) return s as PersonaId;
  return null;
}

export function listPersonaIds(): readonly PersonaId[] {
  return PERSONA_IDS;
}

export function loadPersonaMarkdown(id: PersonaId): string {
  const file = path.join(personasDir(), `${id}.md`);
  if (!existsSync(file)) {
    throw new Error(`Bundled persona file missing: ${file}`);
  }
  return readFileSync(file, "utf8");
}

export function personaListHelpText(): string {
  return `Tymio MCP — bundled agent personas (Markdown prompts)

Usage:
  tymio-mcp persona list              Show this list
  tymio-mcp persona <id>            Print persona prompt to stdout (pipe into your agent / docs)

Ids: ${PERSONA_IDS.join(", ")}

Embed in MCP sessions (stdio / some clients read server instructions):
  export TYMIO_MCP_PERSONA=pm        # or po, dev, workspace
  tymio-mcp                          # persona text is appended to MCP server instructions

Cursor: you can instead enable Skills (.cursor/skills/tymio-*-agent); CLI personas help IDEs without Skills or CI.

`;
}

/**
 * Full MCP server `instructions`: base CLI guide plus optional persona from `TYMIO_MCP_PERSONA`.
 */
export function getMcpServerInstructions(): string {
  const raw = process.env.TYMIO_MCP_PERSONA;
  if (!raw?.trim()) return AGENT_INSTRUCTIONS;

  const id = normalizePersonaId(raw);
  if (!id) {
    process.stderr.write(
      `[tymio-mcp] Unknown TYMIO_MCP_PERSONA="${raw.trim()}". Valid: ${PERSONA_IDS.join(", ")} (hub aliases workspace). See: tymio-mcp persona list\n`
    );
    return AGENT_INSTRUCTIONS;
  }

  let block: string;
  try {
    block = loadPersonaMarkdown(id);
  } catch (e) {
    process.stderr.write(`[tymio-mcp] Could not load persona "${id}": ${e}\n`);
    return AGENT_INSTRUCTIONS;
  }

  return `${AGENT_INSTRUCTIONS}\n\n---\n\n## Bundled agent persona (\`TYMIO_MCP_PERSONA=${id}\`)\n\n${block}\n`;
}

/** Non-empty when a valid persona is active (for stderr startup hint). */
export function activePersonaForHint(): PersonaId | null {
  return normalizePersonaId(process.env.TYMIO_MCP_PERSONA);
}

/** CLI subcommand: `tymio-mcp persona …` — exit code. */
export function runPersonaCli(argv: string[]): number {
  const sub = argv[0];
  if (!sub || sub === "list" || sub === "--help" || sub === "-h") {
    process.stderr.write(personaListHelpText());
    return 0;
  }
  const id = normalizePersonaId(sub);
  if (!id) {
    process.stderr.write(`Unknown persona "${sub}". Run: tymio-mcp persona list\n`);
    return 1;
  }
  try {
    process.stdout.write(loadPersonaMarkdown(id));
    return 0;
  } catch (e) {
    process.stderr.write(String(e) + "\n");
    return 1;
  }
}

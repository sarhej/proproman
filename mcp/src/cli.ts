import { defaultMcpUrl } from "./configPaths.js";
import { AGENT_INSTRUCTIONS, HELP_SUMMARY } from "./cliMessages.js";
import { runApiKeyStdio } from "./apiKeyStdio.js";
import { runHubOAuthStdio } from "./hubProxyStdio.js";
import { runLoginCommand } from "./loginCommand.js";
import { removeAllOAuthFiles } from "./fileOAuthProvider.js";
import { runPersonaCli } from "./persona.js";
import { runBootstrapCommand } from "./bootstrapCommand.js";
import { runDoctorCommand } from "./doctorCommand.js";
import { runSkillCommand } from "./skillCommand.js";

function useApiKeyBridge(): boolean {
  return Boolean(
    process.env.TYMIO_API_KEY?.trim() ||
    process.env.DRD_API_KEY?.trim() ||
    process.env.API_KEY?.trim()
  );
}

export async function runCli(argv: string[]): Promise<void> {
  const args = argv.slice(2).filter((a) => a !== "--");

  if (args[0] === "login") {
    const url = args[1] ? new URL(args[1]) : defaultMcpUrl();
    await runLoginCommand(url);
    return;
  }

  if (args[0] === "logout") {
    removeAllOAuthFiles();
    process.stderr.write("Removed stored Tymio MCP OAuth credentials.\n");
    return;
  }

  if (args[0] === "instructions" || args[0] === "guide") {
    process.stderr.write(`${AGENT_INSTRUCTIONS}\n`);
    return;
  }

  if (args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stderr.write(`${HELP_SUMMARY}\n`);
    return;
  }

  if (args[0] === "persona") {
    process.exitCode = runPersonaCli(args.slice(1));
    return;
  }

  if (args[0] === "doctor") {
    runDoctorCommand();
    return;
  }

  if (args[0] === "bootstrap") {
    process.exitCode = await runBootstrapCommand(args.slice(1));
    return;
  }

  if (args[0] === "skill") {
    process.exitCode = await runSkillCommand(args.slice(1));
    return;
  }

  if (useApiKeyBridge()) {
    await runApiKeyStdio();
    return;
  }

  await runHubOAuthStdio();
}

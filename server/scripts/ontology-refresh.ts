/**
 * CLI: upsert default capabilities/bindings from codebase manifest, then compile stored briefs.
 * Run from repo: npm run ontology:refresh --workspace server
 * Requires DATABASE_URL in server/.env
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileAndStoreBriefs } from "../src/services/ontologyBrief.js";
import { refreshGeneratedOntology } from "../src/services/ontologyRefresh.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const r = await refreshGeneratedOntology();
  console.log("Ontology refresh:", r);
  await compileAndStoreBriefs("compact");
  await compileAndStoreBriefs("full");
  console.log("Compiled briefs stored (md+json, compact+full).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

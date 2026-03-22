/**
 * Sets implementation notes on each Tymio demo hub epic (initiative) so that
 * implementation details are tracked in the product (Product Explorer / initiative panel)
 * rather than only in docs.
 *
 * Run: npx tsx scripts/set-dr-hub-epic-implementation-notes.ts
 * Requires: DATABASE_URL
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();

const PRODUCT_NAME = "Tymio demo hub";

const EPIC_NOTES: Record<string, string> = {
  "Epic: Accesses & Roles": `Implementation details (Epic: Accesses & Roles)

Archive visibility and placement: archive/unarchive action restricted to Admin (or by role). Move "Archivovat / de-archivovat" button to top bar (horní list) for visibility. Initiative already has PATCH archive/unarchive; ensure UI shows archive only for users with canEditStructure or ADMIN. Files: InitiativeDetailPanel (archive button placement), InitiativeForm or panel header; permission check for archive action.`,

  "Epic: Naming & terminology": `Implementation details (Epic 1)

• 1.1 Domény → Pilíře: i18n only. Replace "Doména/Domény" with "Pilíř/Pilíře" in CZ. Files: client/src/i18n/cs.json, sk.json, en.json — keys domain, domains, domainBoard, priorityGrid.domain, filters. No API/DB change.

• 1.2 Partner × Klient: Confirm PM usage (Partner = who buys, Klient = who uses). Check i18n and labels; align or doc. No code change if correct.

• 1.3 Integrations / Integrace: i18n only. Use "Integrations" (EN), "Integrace" (CZ). Search for integration/integrac; add/update i18n keys. No API/DB change.

• 1.4 Priority: i18n. Labels Critical/High/Medium/Low. Add priority.P0 = "Critical", etc. in i18n. Use in FiltersBar, PriorityGrid, ProductTree, initiative/requirement selects. Keep P0–P3 in DB; change display only.`,

  "Epic: Bugs (fix first)": `Implementation details (Epic 2)

RACI: 2.1/2.5 — POST /api/assignments (EDITOR). Verify InitiativeDetailPanel + RaciMatrix Add. 2.2 — PUT /api/assignments (newRole, allocation). Frontend: InitiativeDetailPanel RACI tab, role dropdown + allocation; updateRole and allocation blur call api.updateAssignment. Verify UI.

Iniciativa: 2.3 — Done. InitiativeForm title in Details; api.updateInitiative. Verify title visible/editable. 2.4 — Done. Nav "New initiative" → ?new=1 → modal. Verify placement; optional board CTA.

Admin: 2.6 — Backend: initiative PUT strips productId, horizon, commercialType, dealStage for non-ADMIN. Frontend: InitiativeForm adminOnlyFields; when false those 4 selects disabled. Verify EDITOR sees them disabled. Files: InitiativeForm.tsx, call sites passing adminOnlyFields.

Požadavky: 2.7 — Done. Entry points: ProductTree, FeatureDetailPage, InitiativeDetailPanel, RequirementsPage. POST /api/requirements. Verify all four. 2.8 — Done. RequirementDetailPage taskType "Unspecified" (null). Verify create without type and edit to Unspecified.

Účty: 2.9 — Done. AccountsPage edit name/type; api.updateAccount. Verify; extend form if product needs segment/dealStage/etc.

Edit feature title: Done. FeatureDetailPage editable title, onFeatureUpdated; App merges into board.`,

  "Epic: Feature/UX requirements": `Implementation details (Epic 3)

Iniciativa – form & fields: 3.1 Show product/asset on initiative cards — InitiativeCard, initiative.product?.name. 3.2 Document upload — new InitiativeDocument or S3; additive. 3.3 Horizont Q1–Q4 — blocked by 4.6. 3.4 CK list — success-criteria exist; link Gantt completion. 3.5 Poznámky → Komentáře — expand comment UI (date, author, formatting). 3.6 Jistota data — blocked 4.1. 3.7 Přiřazení tržeb — blocked 4.2. 3.8 Save in header — move Save to sticky header. 3.9 Archive not delete — PATCH archive; "Show archived" filter. 3.10 Person radar — blocked 4.3.

Gantt: 3.11 Colours by status — use initiative.status not domain. GanttPage, timeline API. 3.12 Completion % — success criteria or completionPercent. 3.13 Views by quarter/year — time range presets. 3.14 Timing export — blocked 4.4.

Milníky: 3.15 Click status box → filter. 3.16 Archive (same as 3.9). 3.17 Chart by status in period. 3.18 Quarter filter (depends 4.6).

Kampaně: 3.19 Concept — blocked 4.5. 3.20 Show campaign date in list. 3.21 Campaign type list — after 4.5.

Účty: 3.22 Link campaign → /campaigns/:id. Produkty: 3.23 Requirements in overview — decision. 3.24 Filters status + impact.`,

  "Epic: Clarifications needed": `Implementation details (Epic 4)

Product/decision items. After each decision, implement dependent Epic 3 work.

• 4.1 Jistota data — Confirm if used; if not remove (enables 3.6).
• 4.2 Přiřazení tržeb — Align with product/Jitka (enables 3.7).
• 4.3 Person radar — Keep or drop (enables 3.10).
• 4.4 Souřad s timingem z Gantu — Define export/sync target (enables 3.14).
• 4.5 Kampaně — Align with Nela; placement and type list (enables 3.19, 3.21).
• 4.6 Horizont Q1–Q4 — Format and rules with Ondra (enables 3.3, 3.18).`
};

async function main() {
  const product = await prisma.product.findFirst({
    where: { name: PRODUCT_NAME }
  });
  if (!product) {
    throw new Error(`Product "${PRODUCT_NAME}" not found. Run db:populate-tymio-demo --workspace server first.`);
  }

  const initiatives = await prisma.initiative.findMany({
    where: { productId: product.id }
  });

  for (const init of initiatives) {
    const notes = EPIC_NOTES[init.title];
    if (!notes) {
      console.log("Skip (no notes defined):", init.title);
      continue;
    }
    await prisma.initiative.update({
      where: { id: init.id },
      data: { notes }
    });
    console.log("Updated notes for:", init.title);
  }

  console.log("Done. Open Product Explorer → Tymio demo hub → open each epic to see implementation notes in Notes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

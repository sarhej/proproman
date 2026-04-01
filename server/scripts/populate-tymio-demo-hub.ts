/**
 * Populates the Tymio demo hub asset: product, linked initiatives,
 * features and requirements (idempotent where noted).
 *
 * Run: npm run db:populate-tymio-demo --workspace server
 * Or from server: npx tsx scripts/populate-tymio-demo-hub.ts
 * Requires DATABASE_URL (e.g. from server/.env).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import { CommercialType, FeatureStatus, Horizon, InitiativeStatus, Priority } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_NAME = "Tymio demo hub";
/** Must match your Hub domain (e.g. "Technologický Leader" or "Technologický lídr" from seed). */
const DOMAIN_NAME = "Technologický Leader";
/** Epics only (Initiative = Epic). No summary initiative; overview lives in product description. */
const INITIATIVE_TITLES = [
  "Epic: Naming & terminology",
  "Epic: Bugs (fix first)",
  "Epic: Feature/UX requirements",
  "Epic: Clarifications needed"
] as const;

/** Idempotent: ensure a requirement exists under featureId with this title; create only if not found. */
async function ensureRequirement(
  featureId: string,
  title: string,
  payload: { description?: string | null; priority?: Priority }
) {
  const existing = await prisma.requirement.findFirst({
    where: { featureId, title }
  });
  if (existing) return existing;
  return prisma.requirement.create({
    data: { featureId, title, description: payload.description ?? null, priority: payload.priority ?? Priority.P2 }
  });
}

async function main() {
  let domain = await prisma.domain.findFirst({
    where: { name: DOMAIN_NAME }
  });
  if (!domain) {
    domain = await prisma.domain.findFirst({
      where: { name: { contains: "Technologický", mode: "insensitive" } }
    });
  }
  if (!domain) {
    throw new Error(`Domain "${DOMAIN_NAME}" not found. Create it or adjust DOMAIN_NAME.`);
  }
  console.log("Using domain:", domain.name, domain.id);

  let product = await prisma.product.findFirst({
    where: { name: PRODUCT_NAME }
  });
  if (!product) {
    product = await prisma.product.create({
      data: { name: PRODUCT_NAME, description: "Dr.D Hub updates: naming, bugs, features/UX, clarifications.", sortOrder: 50 }
    });
    console.log("Created product:", product.name, product.id);
  } else {
    console.log("Using existing product:", product.name, product.id);
  }

  let initiatives = await prisma.initiative.findMany({
    where: { domainId: domain.id, title: { in: [...INITIATIVE_TITLES] } }
  });
  if (initiatives.length < INITIATIVE_TITLES.length) {
    const existingTitles = new Set(initiatives.map((i) => i.title));
    for (const title of INITIATIVE_TITLES) {
      if (existingTitles.has(title)) continue;
      const created = await prisma.initiative.create({
        data: {
          title,
          domainId: domain.id,
          productId: product.id,
          priority: Priority.P2,
          horizon: Horizon.NOW,
          status: InitiativeStatus.IDEA,
          commercialType: CommercialType.CARE_QUALITY,
          isGap: false,
          isEpic: true
        }
      });
      initiatives = [...initiatives, created];
      console.log("Created initiative (epic):", created.title);
    }
  }
  if (initiatives.length === 0) {
    throw new Error(
      `No initiatives in domain "${DOMAIN_NAME}". Create failed or domain mismatch.`
    );
  }

  for (const init of initiatives) {
    if (init.productId !== product.id) {
      await prisma.initiative.update({
        where: { id: init.id },
        data: { productId: product.id }
      });
      console.log("Linked initiative to product:", init.title);
    }
  }

  const byTitle = new Map(initiatives.map((i) => [i.title, i]));

  // --- Epic: Naming & terminology ---
  const namingInit = byTitle.get("Epic: Naming & terminology");
  if (namingInit) {
    const existingNaming = await prisma.feature.findFirst({ where: { initiativeId: namingInit.id } });
    if (existingNaming) {
      console.log("Naming: features already exist, skip.");
    } else {
    const namingFeature = await prisma.feature.create({
      data: {
        initiativeId: namingInit.id,
        title: "Naming & terminology",
        description: "Decisions only. Apply in UI and docs.",
        status: FeatureStatus.IDEA,
        sortOrder: 0
      }
    });
    const namingReqs = [
      { title: "1.1 Domény → Pilíře", description: "Use term “Pilíře” instead of “Domény” everywhere." },
      { title: "1.2 Partner × Klient", description: "Keep as PM requested: Partner (who buys) and Klient (who uses)." },
      { title: "1.3 Integrations / Integrace", description: "Use “Integrations” (EN) / “Integrace” (CZ). Keep existing structure; rename in UI and docs only." },
      { title: "1.4 Priority", description: "Prefer labels: Critical / High / Medium / Low." }
    ];
    for (let i = 0; i < namingReqs.length; i++) {
      await ensureRequirement(namingFeature.id, namingReqs[i].title, {
        description: namingReqs[i].description,
        priority: Priority.P2
      });
    }
    console.log("Created Naming feature +", namingReqs.length, "requirements");
    }
  }

  // --- Epic: Bugs (fix first) ---
  const bugsInit = byTitle.get("Epic: Bugs (fix first)");
  if (bugsInit) {
    const existingBugs = await prisma.feature.findFirst({ where: { initiativeId: bugsInit.id } });
    if (existingBugs) {
      console.log("Bugs: features already exist, skip.");
    } else {
    const bugGroups: { featureTitle: string; requirements: { title: string; description: string }[] }[] = [
      {
        featureTitle: "RACI",
        requirements: [
          { title: "2.1 Cannot add new stakeholders", description: "Fix: allow adding new stakeholders in RACI." },
          { title: "2.2 Cannot edit stakeholders", description: "Fix: allow editing existing stakeholders." },
          { title: "2.5 RACI – cannot add people (repeated)", description: "Same as 2.1 – single fix." }
        ]
      },
      {
        featureTitle: "Iniciativa (Initiative)",
        requirements: [
          { title: "2.3 Cannot change initiative name", description: "Fix: enable editing of initiative title/name." },
          { title: "2.4 Cannot create new Initiative from main page", description: "Fix: “create new Initiative” from main page (ideally in top/priority area)." }
        ]
      },
      {
        featureTitle: "Admin",
        requirements: [
          { title: "2.6 No way to edit product/assets, horizont, etc.", description: "Add/edit UI for admin entities: product/assets, horizont, komerční typ, fáze obchodu." }
        ]
      },
      {
        featureTitle: "Požadavky (Requirements)",
        requirements: [
          { title: "2.7 Cannot add new requirement", description: "Fix: allow creating new požadavek." },
          { title: "2.8 No option for requirement without specification type", description: "Allow “unspecified” or “no specification” when creating/editing." }
        ]
      },
      {
        featureTitle: "Účty (Accounts)",
        requirements: [
          { title: "2.9 Cannot edit entered accounts", description: "Add edit for existing účty." }
        ]
      }
    ];
    for (let g = 0; g < bugGroups.length; g++) {
      const feat = await prisma.feature.create({
        data: {
          initiativeId: bugsInit.id,
          title: bugGroups[g].featureTitle,
          status: FeatureStatus.PLANNED,
          sortOrder: g
        }
      });
      for (const r of bugGroups[g].requirements) {
        await ensureRequirement(feat.id, r.title, { description: r.description, priority: Priority.P1 });
      }
      console.log("Created Bugs feature:", feat.title, "+", bugGroups[g].requirements.length, "requirements");
    }
    }

    // Ensure "Editovat název funkce na obrazovce funkce" exists (idempotent for existing demo hub)
    const editTitleFeatureTitle = "Editovat název funkce na obrazovce funkce";
    const existingEditTitle = await prisma.feature.findFirst({
      where: { initiativeId: bugsInit.id, title: editTitleFeatureTitle }
    });
    if (!existingEditTitle) {
      const editTitleFeat = await prisma.feature.create({
        data: {
          initiativeId: bugsInit.id,
          title: editTitleFeatureTitle,
          status: FeatureStatus.PLANNED,
          sortOrder: 100
        }
      });
      await ensureRequirement(editTitleFeat.id, "Feature title editable on feature detail page", {
        description: "On FeatureDetailPage, feature title is editable (inline or Edit toggle); same behaviour as product tree.",
        priority: Priority.P2
      });
      console.log("Created Bugs feature:", editTitleFeat.title, "+ 1 requirement");
    }
  }

  // --- Epic: Feature/UX requirements ---
  const uxInit = byTitle.get("Epic: Feature/UX requirements");
  if (uxInit) {
    const existingUx = await prisma.feature.findFirst({ where: { initiativeId: uxInit.id } });
    if (existingUx) {
      console.log("Feature/UX: features already exist, skip.");
    } else {
    const uxGroups: { featureTitle: string; requirements: { title: string; description: string }[] }[] = [
      {
        featureTitle: "Iniciativa – form & fields",
        requirements: [
          { title: "3.1 Produkt / asset na kartách", description: "Show the assigned product or asset on the small initiative cards." },
          { title: "3.2 Upload dokumentu", description: "Add document upload for initiative." },
          { title: "3.3 Horizont", description: "Add quarters (Q1–Q4/rok). Format e.g. Q1/2026 … Q4/2026." },
          { title: "3.4 Kritéria úspěchu (CK list)", description: "Allow success criteria list; link to Gantt completion tracking." },
          { title: "3.5 Poznámky → Komentáře", description: "Replace notes with comment-style UI: date, author, larger area, formatting, visual emphasis." },
          { title: "3.6 Jistota data", description: "Confirm if used anywhere; if not, remove." },
          { title: "3.7 Přiřazení tržeb", description: "Clarify with product/Jitka – “nesedí” meaning and correct behaviour." },
          { title: "3.8 Uložit", description: "Move Save button to header." },
          { title: "3.9 Mazání vs. archivace", description: "Do not allow hard delete; archive instead (section for completed/archived initiatives)." },
          { title: "3.10 Person radar", description: "Decide if needed; keep or remove." }
        ]
      },
      {
        featureTitle: "Gantt",
        requirements: [
          { title: "3.11 Barvy podle stavu", description: "Colour initiatives by status (e.g. in progress, done, not started), not by domain." },
          { title: "3.12 Úroveň dokončení", description: "Show completion % linked to real progress. Add state “prodlouženo” if initiative continues." },
          { title: "3.13 Náhledy", description: "Views by quarter and year." },
          { title: "3.14 Souřad s timingem", description: "Clarify: export/sync timing from Gantt (to what system/format?)." }
        ]
      },
      {
        featureTitle: "Milníky (Milestones)",
        requirements: [
          { title: "3.15 Filtry na součty stavů", description: "Click on status box → filter to initiatives of that status." },
          { title: "3.16 Archivace", description: "Option to archive initiative/activity." },
          { title: "3.17 Graf (koláčový nebo jiný)", description: "Chart for initiative status in given period (e.g. Q1/2026), highlight critical/blocked." },
          { title: "3.18 Horizont v milestonech", description: "Filters by Q1–Qx/YYYY." }
        ]
      },
      {
        featureTitle: "Kampaně (Campaigns)",
        requirements: [
          { title: "3.19 Koncept kampaně", description: "Define: “marketing activity for a period”, likely part of initiative; decide how to show in UI." },
          { title: "3.20 Datum kampaně", description: "In first/default view, show campaign date." },
          { title: "3.21 Číselník typu kampaně", description: "Configure with Nela (reference list of campaign types)." }
        ]
      },
      {
        featureTitle: "Účty (Accounts)",
        requirements: [
          { title: "3.22 Proklik na kampaně", description: "From displayed campaign (e.g. “Znojmo”) open that campaign directly." }
        ]
      },
      {
        featureTitle: "Produkty / assets",
        requirements: [
          { title: "3.23 Požadavky v přehledu?", description: "Decide if “požadavky” should appear in product/assets overview." },
          { title: "3.24 Filtry", description: "Filter by status and dopad (impact)." }
        ]
      }
    ];
    for (let g = 0; g < uxGroups.length; g++) {
      const feat = await prisma.feature.create({
        data: {
          initiativeId: uxInit.id,
          title: uxGroups[g].featureTitle,
          status: FeatureStatus.IDEA,
          sortOrder: g
        }
      });
      for (const r of uxGroups[g].requirements) {
        await ensureRequirement(feat.id, r.title, { description: r.description, priority: Priority.P2 });
      }
      console.log("Created Feature/UX:", feat.title, "+", uxGroups[g].requirements.length, "requirements");
    }
    }
  }

  // --- Epic: Clarifications needed ---
  const clarInit = byTitle.get("Epic: Clarifications needed");
  if (clarInit) {
    const existingClar = await prisma.feature.findFirst({ where: { initiativeId: clarInit.id } });
    if (existingClar) {
      console.log("Clarifications: features already exist, skip.");
    } else {
    const clarFeature = await prisma.feature.create({
      data: {
        initiativeId: clarInit.id,
        title: "Clarifications needed",
        description: "Before implementation.",
        status: FeatureStatus.IDEA,
        sortOrder: 0
      }
    });
    const clarReqs = [
      { title: "4.1 Jistota data", description: "Is it used anywhere? If not → remove." },
      { title: "4.2 Přiřazení tržeb", description: "Meaning and desired behaviour – align with product/Jitka." },
      { title: "4.3 Person radar", description: "Confirm necessity; keep or drop." },
      { title: "4.4 Souřad s timingem z Gantu", description: "What system/format should receive timing from Gantt?" },
      { title: "4.5 Kampaně", description: "Exact place in initiative flow and how to “správně naparovat” – align with Nela." },
      { title: "4.6 Horizont (Q1–Q4)", description: "Final format and rules with Ondra; KPIs per quarter and limit per stakeholder." }
    ];
    for (const r of clarReqs) {
      await ensureRequirement(clarFeature.id, r.title, { description: r.description, priority: Priority.P2 });
    }
    console.log("Created Clarifications feature +", clarReqs.length, "requirements");
    }
  }

  console.log("Done. Tymio demo hub product, initiatives linked, features and requirements created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

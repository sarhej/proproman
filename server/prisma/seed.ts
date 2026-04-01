import {
  AssignmentRole,
  AccountType,
  AssetStatus,
  AuditAction,
  AssetType,
  CampaignStatus,
  CampaignType,
  CommercialType,
  DealStage,
  FeatureStatus,
  DemandSourceType,
  DemandStatus,
  DateConfidence,
  Horizon,
  InitiativeStatus,
  MilestoneStatus,
  NotificationRecipientKind,
  PersonaCategory,
  Priority,
  PrismaClient,
  TaskStatus,
  TopLevelItemType,
  StakeholderRole,
  StakeholderType,
  StrategicTier,
  UserRole
} from "@prisma/client";
import { createTenantExtension } from "../src/tenant/tenantPrisma.js";
import { runWithTenant, TenantContext } from "../src/tenant/tenantContext.js";
import { provisionTenant } from "../src/tenant/tenantProvisioning.js";

const basePrisma = new PrismaClient();
const prisma = createTenantExtension(basePrisma);

async function main() {
  // ─── Truncate (dependency order) ────────────────────────────────
  await prisma.auditEntry.deleteMany();
  await prisma.stakeholder.deleteMany();
  await prisma.initiativeKPI.deleteMany();
  await prisma.initiativeMilestone.deleteMany();
  await prisma.campaignLink.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.initiativeAssignment.deleteMany();
  await prisma.demandLink.deleteMany();
  await prisma.demand.deleteMany();
  await prisma.account.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.dependency.deleteMany();
  await prisma.risk.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.initiativeRevenueStream.deleteMany();
  await prisma.initiativePersonaImpact.deleteMany();
  await prisma.initiative.deleteMany();
  await prisma.product.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.revenueStream.deleteMany();
  await prisma.userEmail.deleteMany();
  await prisma.tenantMembership.deleteMany();
  await prisma.tenantMigrationState.deleteMany();
  await prisma.tenantDomain.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();

  // ─── Tymio product hub (system workspace — feedback MCP, non-deletable) ──
  const tymioTenant = await prisma.tenant.create({
    data: {
      name: "Tymio",
      slug: "tymio",
      schemaName: "tenant_tymio",
      isSystem: true,
      status: "PROVISIONING",
      migrationState: { create: { schemaVersion: 0, status: "pending" } },
    },
  });
  await provisionTenant(tymioTenant.id);

  // ─── Default demo tenant ─────────────────────────────────────────
  const defaultTenant = await prisma.tenant.create({
    data: {
      name: "Demo Workspace",
      slug: "demo",
      schemaName: "tenant_demo",
      status: "ACTIVE",
      migrationState: { create: { schemaVersion: 1, status: "current", lastMigratedAt: new Date() } },
    },
  });
  const TENANT_ID = defaultTenant.id;
  const tenantCtx: TenantContext = {
    tenantId: TENANT_ID,
    tenantSlug: "demo",
    schemaName: "tenant_demo",
    membershipRole: "OWNER",
  };

  // Run all seed operations within the tenant context so tenantId is auto-injected
  await runWithTenant(tenantCtx, () => seedTenantData(TENANT_ID, tymioTenant.id));
}

async function seedTenantData(TENANT_ID: string, tymioTenantId: string) {
  // ─── Sole operator (Google sign-in: s@strt.vc) ─────────────────
  // Demo content below still names historical RACI/owners; all rows point at this user.
  const teamDefs: { name: string; email: string; aliases?: string[]; role: UserRole }[] = [
    {
      name: "Sergej Fedorovic",
      email: "s@strt.vc",
      aliases: ["sarhej@gmail.com"],
      role: UserRole.SUPER_ADMIN,
    },
  ];

  const users = await Promise.all(
    teamDefs.map((t) =>
      prisma.user.upsert({
        where: { email: t.email },
        create: { name: t.name, email: t.email, role: t.role, isActive: true },
        update: { name: t.name, role: t.role, isActive: true },
      })
    )
  );

  for (let i = 0; i < teamDefs.length; i++) {
    const def = teamDefs[i];
    const user = users[i];
    await prisma.userEmail.create({ data: { email: def.email, userId: user.id, isPrimary: true } });
    for (const alias of def.aliases ?? []) {
      await prisma.userEmail.create({ data: { email: alias, userId: user.id, isPrimary: false } });
    }
    const memberRole = def.role === UserRole.SUPER_ADMIN ? "OWNER" : def.role === UserRole.ADMIN ? "ADMIN" : "MEMBER";
    await prisma.tenantMembership.create({
      data: { tenantId: TENANT_ID, userId: user.id, role: memberRole },
    });
    await prisma.tenantMembership.create({
      data: { tenantId: tymioTenantId, userId: user.id, role: "OWNER" },
    });
    await prisma.user.update({ where: { id: user.id }, data: { activeTenantId: TENANT_ID } });
  }

  const sole = users[0];
  const u: Record<string, typeof sole> = {
    Ondra: sole,
    Sergei: sole,
    Nelca: sole,
    Vasek: sole,
    Michael: sole,
    Kuba: sole,
    Adela: sole,
    Zdenek: sole,
    Ales: sole,
    Jitka: sole,
    David: sole,
    Martina: sole,
    Pavel: sole,
    Marek: sole,
    Filip: sole,
  };

  // ─── Produkty ──────────────────────────────────────────────────
  const products = await Promise.all(
    [
      {
        name: "Tymio app",
        description: "Mobilní a webová aplikace pro pacienty a lékaře",
        sortOrder: 1,
        itemType: TopLevelItemType.PRODUCT
      },
      {
        name: "B2B Platforma",
        description: "Portál pro zaměstnavatele, pojišťovny a orgány státní správy",
        sortOrder: 2,
        itemType: TopLevelItemType.PRODUCT
      },
      {
        name: "Integrační platforma",
        description: "Partnerské API, eGov a integrace pojišťoven",
        sortOrder: 3,
        itemType: TopLevelItemType.SYSTEM
      }
    ].map((p) => prisma.product.create({ data: p }))
  );
  const prod = Object.fromEntries(products.map((p) => [p.name, p]));

  for (const p of products) {
    await prisma.executionBoard.create({
      data: {
        productId: p.id,
        name: "Delivery",
        isDefault: true,
        columns: {
          create: [
            { name: "Backlog", sortOrder: 0, mappedStatus: TaskStatus.NOT_STARTED, isDefault: true },
            { name: "In progress", sortOrder: 1, mappedStatus: TaskStatus.IN_PROGRESS, isDefault: false },
            { name: "Testing", sortOrder: 2, mappedStatus: TaskStatus.TESTING, isDefault: false },
            { name: "Done", sortOrder: 3, mappedStatus: TaskStatus.DONE, isDefault: false }
          ]
        }
      }
    });
  }

  // ─── Domény (pilíře z workshopu Kalhov) ────────────────────────
  const domains = await Promise.all(
    [
      { name: "Klient", color: "#7c3aed", sortOrder: 1 },
      { name: "Tržby", color: "#2563eb", sortOrder: 2 },
      { name: "Nad rámec obvyklého", color: "#059669", sortOrder: 3 },
      { name: "B2B", color: "#0f766e", sortOrder: 4 },
      { name: "Technologický lídr", color: "#f59e0b", sortOrder: 5 },
      { name: "Compliance", color: "#dc2626", sortOrder: 6 },
      { name: "Platforma", color: "#d97706", sortOrder: 7 },
    ].map((d) => prisma.domain.create({ data: d }))
  );
  const dom = Object.fromEntries(domains.map((d) => [d.name, d]));

  // ─── Persony ───────────────────────────────────────────────────
  const personas = await Promise.all(
    [
      { name: "Pacient", icon: "user", category: PersonaCategory.USER },
      { name: "Lékař", icon: "stethoscope", category: PersonaCategory.USER },
      { name: "Zaměstnavatel", icon: "building", category: PersonaCategory.BUYER },
      { name: "Pojišťovna", icon: "shield", category: PersonaCategory.BUYER },
      { name: "B2B Admin", icon: "briefcase", category: PersonaCategory.BUYER },
      { name: "Regulátor", icon: "scale", category: PersonaCategory.BUYER },
    ].map((p) => prisma.persona.create({ data: p }))
  );
  const per = Object.fromEntries(personas.map((p) => [p.name, p]));

  // ─── Revenue streamy ──────────────────────────────────────────
  const streams = await Promise.all(
    [
      { name: "B2B", color: "#0ea5e9" },
      { name: "B2G2C", color: "#8b5cf6" },
      { name: "B2C", color: "#f97316" },
      { name: "Pojištění", color: "#10b981" },
      { name: "B2B2C", color: "#ec4899" },
    ].map((s) => prisma.revenueStream.create({ data: s }))
  );
  const str = Object.fromEntries(streams.map((s) => [s.name, s]));

  // ─── Účty ─────────────────────────────────────────────────────
  const accounts = await Promise.all(
    [
      { name: "Uniqa pojištění cizinců", type: AccountType.INSURER, segment: "Pojištění cizinců", ownerId: u.Ondra.id, arrImpact: 500000, dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_1 },
      { name: "OZP (Oborová zdravotní pojišťovna)", type: AccountType.INSURER, segment: "Zdravotní pojišťovna CZ", ownerId: u.Ondra.id, arrImpact: 350000, dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1 },
      { name: "UNION pojišťovna SK", type: AccountType.INSURER, segment: "Zdravotní pojišťovna SK", ownerId: u.Ondra.id, arrImpact: 200000, dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1 },
      { name: "PwC Česká republika", type: AccountType.EMPLOYER, segment: "Enterprise zaměstnavatel", ownerId: u.Vasek.id, arrImpact: 180000, dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2 },
      { name: "PwC Slovensko", type: AccountType.EMPLOYER, segment: "Enterprise zaměstnavatel SK", ownerId: u.Vasek.id, arrImpact: 120000, dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2 },
      { name: "Magistrát hl. m. Prahy", type: AccountType.B2G2C, segment: "Orgán státní správy", ownerId: u.Adela.id, arrImpact: 400000, dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1 },
      { name: "Znojmo (město)", type: AccountType.B2G2C, segment: "Municipalita", ownerId: u.Adela.id, arrImpact: 150000, dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2 },
    ].map((a) => prisma.account.create({ data: a }))
  );
  const acc = Object.fromEntries(accounts.map((a) => [a.name, a]));

  // ─── Partneři ─────────────────────────────────────────────────
  const partners = await Promise.all(
    [
      { name: "Broker Trust", kind: "Makléřská společnost", ownerId: u.Vasek.id },
      { name: "Infermedica", kind: "Symptom checker a triáž", ownerId: u.Sergei.id },
      { name: "Kardi AI", kind: "Kardiologická AI triáž", ownerId: u.Pavel.id },
      { name: "Lesensky.cz", kind: "PR agentura", ownerId: u.Nelca.id },
      { name: "Adriana Boďová", kind: "Grafický design", ownerId: u.Nelca.id },
      { name: "Eurocross", kind: "Asistenční služby (stávající dodavatel)", ownerId: u.Ondra.id },
      { name: "Daktela", kind: "Telefonní platforma / Call centrum", ownerId: u.Ondra.id },
      { name: "Vitapharma", kind: "Lékové konzultace (akvizice)", ownerId: u.Ondra.id },
    ].map((p) => prisma.partner.create({ data: p }))
  );
  const par = Object.fromEntries(partners.map((p) => [p.name, p]));

  // ─── Iniciativy ────────────────────────────────────────────────
  type InitDef = {
    title: string;
    problemStatement: string;
    successCriteria: string;
    description: string;
    product: string;
    domain: string;
    owner: string;
    priority: Priority;
    horizon: Horizon;
    status: InitiativeStatus;
    commercialType: CommercialType;
    isGap?: boolean;
    startDate: string;
    targetDate: string;
    milestoneDate: string;
    dateConfidence: DateConfidence;
    arrImpact: number;
    dealStage: DealStage;
    strategicTier: StrategicTier;
    notes?: string;
    impacts: Record<string, number>;
    revenueWeights: Record<string, number>;
    raci: { accountable: string; implementer: string; consulted: string[]; informed: string[] };
    features: { title: string; description: string; status: FeatureStatus; startDate: string; targetDate: string; requirements: string[] }[];
    milestones: { title: string; targetDate?: string; status: MilestoneStatus; owner?: string }[];
    kpis: { title: string; targetValue?: string; currentValue?: string; unit?: string; targetDate?: string }[];
    stakeholders: { name: string; role: StakeholderRole; type: StakeholderType; organization?: string }[];
    risks: { title: string; probability: "LOW" | "MEDIUM" | "HIGH"; impact: "LOW" | "MEDIUM" | "HIGH"; mitigation: string; owner: string }[];
  };

  const initDefs: InitDef[] = [
    // ── 1. Webové rozhraní (Klient) ────────────────────────────
    {
      title: "Webové rozhraní",
      problemStatement: "Pacienti a lékaři potřebují plnohodnotnou webovou aplikaci doplňující mobilní app pro správu zdravotních záznamů, objednávky a chat z desktopu.",
      successCriteria: "Pacienti mohou z webu řešit vše, co z mobilní aplikace. Roste počet konzultací z desktopového rozhraní.",
      description: "Plnohodnotná webová aplikace umožňující pacientům spravovat zdravotní záznamy, objednávat se k lékaři a komunikovat s lékaři z desktopu. Zahrnuje timeline zdraví, objednávkový systém a secure messaging.",
      product: "Tymio app", domain: "Klient", owner: "David",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-03-01", targetDate: "2026-06-30", milestoneDate: "2026-05-01",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 65000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 5, Lékař: 4, Zaměstnavatel: 2, Pojišťovna: 1, "B2B Admin": 1, Regulátor: 1 },
      revenueWeights: { B2B: 10, B2G2C: 15, B2C: 60, Pojištění: 15, B2B2C: 0 },
      raci: { accountable: "David", implementer: "Jitka", consulted: ["Nelca", "Sergei"], informed: ["Kuba"] },
      features: [
        { title: "Zdravotní timeline pacienta", description: "Chronologický přehled všech zdravotních událostí - návštěvy, recepty, laboratorní výsledky, očkování.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-10", targetDate: "2026-05-01", requirements: ["FHIR normalizace dat", "Infinite scroll s lazy loading", "Filtrování podle typu události"] },
        { title: "Objednávkový systém (web)", description: "Desktopově optimalizované objednávání s kalendářovou integrací a dostupností lékařů.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-15", targetDate: "2026-04-30", requirements: ["Kalendářový pohled s time sloty", "Vyhledávání a filtrování lékařů", "Potvrzovací email"] },
        { title: "Secure messaging (web)", description: "End-to-end šifrované zprávy mezi pacienty a lékaři.", status: FeatureStatus.PLANNED, startDate: "2026-04-15", targetDate: "2026-06-15", requirements: ["Chat SDK integrace", "Podpora příloh a obrázků", "Potvrzení o přečtení"] },
      ],
      milestones: [
        { title: "MVP web rozhraní nasazeno", targetDate: "2026-04-30", status: MilestoneStatus.IN_PROGRESS, owner: "David" },
        { title: "Secure messaging integrace", targetDate: "2026-06-15", status: MilestoneStatus.TODO, owner: "Jitka" },
      ],
      kpis: [
        { title: "Počet konzultací z webu měsíčně", targetValue: "200", currentValue: "0", unit: "konzultací/měsíc", targetDate: "2026-06-30" },
        { title: "Podíl webových uživatelů", targetValue: "30", currentValue: "0", unit: "%", targetDate: "2026-06-30" },
      ],
      stakeholders: [
        { name: "CEO", role: StakeholderRole.SPONSOR, type: StakeholderType.INTERNAL },
        { name: "UX tým", role: StakeholderRole.REVIEWER, type: StakeholderType.INTERNAL },
      ],
      risks: [
        { title: "Výkon web app s velkými zdravotními historiemi", probability: "LOW", impact: "HIGH", mitigation: "Implementovat virtual scrolling a paginaci od začátku. Nastavit výkonnostní testování se syntetickými daty.", owner: "Jitka" },
      ],
    },
    // ── 2. Sdílení profilů / Dětský profil (Klient) ────────────
    {
      title: "Skupina Rodina (Dětský profil)",
      problemStatement: "Umožnit uživatelům spravovat zdravotní péči celé rodiny v rámci jednoho účtu a zajistit dostupnější, rychlejší a koordinovanější péči přes Tymio.",
      successCriteria: "Hlava rodiny může pozvat členy do aplikace a spravovat dětské profily. Přístup k datům jiného člena rodiny je možný pouze na základě souhlasu. Zvýšený engagement, retence a počet řešených případů na domácnost.",
      description: "Zavedení funkce Skupina Rodina - hlava rodiny pozve členy domácnosti do aplikace a spravuje jejich zdravotní agendu (děti, rodiče) na základě jasně definovaných oprávnění a oboustranných souhlasů. Dětský profil lze založit od narození.",
      product: "Tymio app", domain: "Klient", owner: "Kuba",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-06-01", targetDate: "2026-10-15", milestoneDate: "2026-08-01",
      dateConfidence: DateConfidence.LOW, arrImpact: 45000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 5, Lékař: 3, Zaměstnavatel: 3, Pojišťovna: 2, "B2B Admin": 1, Regulátor: 2 },
      revenueWeights: { B2B: 20, B2G2C: 20, B2C: 50, Pojištění: 10, B2B2C: 0 },
      raci: { accountable: "Kuba", implementer: "David", consulted: ["Martina", "Ondra"], informed: ["Nelca"] },
      features: [
        { title: "Průvodce vytvořením dětského profilu", description: "Krokový průvodce pro rodiče k vytvoření a konfiguraci zdravotního profilu dítěte s oprávněními zákonného zástupce.", status: FeatureStatus.IDEA, startDate: "2026-06-15", targetDate: "2026-08-15", requirements: ["Věkově přizpůsobené UI", "Tok souhlasu zákonného zástupce", "Auto-propojení s pediatrem"] },
        { title: "Pozvánky pro sdílení v rodině", description: "Pozvání členů rodiny k zobrazení/správě sdílených profilů s granulárním řízením oprávnění.", status: FeatureStatus.IDEA, startDate: "2026-07-15", targetDate: "2026-09-30", requirements: ["Pozvánka emailem/SMS", "Úrovně oprávnění (zobrazení/úprava/správa)", "Tok odvolání"] },
      ],
      milestones: [
        { title: "Právní audit - analýza sdílení dat, zastupování nezletilých", targetDate: "2026-06-30", status: MilestoneStatus.TODO, owner: "Kuba" },
        { title: "Produktový workshop (COO + CTO + UX) - definice role modelu", status: MilestoneStatus.TODO, owner: "Kuba" },
        { title: "Vytvoření MVP návrhu featury + interní schválení rozsahu", status: MilestoneStatus.TODO, owner: "David" },
      ],
      kpis: [
        { title: "Počet rodinných skupin", targetValue: "500", currentValue: "0", unit: "rodin", targetDate: "2026-10-15" },
        { title: "Případy na domácnost", targetValue: "3", currentValue: "0", unit: "případy/domácnost/rok", targetDate: "2026-10-15" },
      ],
      stakeholders: [
        { name: "Zákon / Legislativa", role: StakeholderRole.LEGAL, type: StakeholderType.EXTERNAL },
        { name: "CEO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "CTO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "COO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "UX Lead", role: StakeholderRole.REVIEWER, type: StakeholderType.INTERNAL },
      ],
      risks: [
        { title: "Legislativní omezení (pediatrie a odpovědnost)", probability: "MEDIUM", impact: "HIGH", mitigation: "Právní audit jako první krok. Jasná definice rolí a oprávnění.", owner: "Kuba" },
        { title: "Komplexní UX (nepochopení procesu souhlasu)", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Pilotní test před plošným rolloutem. Interní školení týmu.", owner: "David" },
        { title: "Technická složitost (role, přechod dítě → dospělý účet)", probability: "LOW", impact: "HIGH", mitigation: "Postupné nasazení. Stabilizovaná pediatrie před spuštěním.", owner: "Kuba" },
      ],
      notes: "Potřebné zdroje: Technický návrh (role, oprávnění, architektura dat), UX návrh (onboarding rodiny, souhlasy), vývoj BE+FE, QA + pilotní test, propojení z B2C. Právní: audit pediatrie, nastavení souhlasů. Tymio Medical: procesy, stabilizovaná pediatrie, školení.",
    },
    // ── 3. Jsme klinika plná lidí (Klient) ─────────────────────
    {
      title: "Jsme klinika plná lidí",
      problemStatement: "Ukazujeme, že lidé v týmu Tymio nejsou náhodní nebo virtuální doktoři, ale živí lidé, tým, který spolupracuje, sdílí know-how a pomáhá klientům.",
      successCriteria: "Klienti dokáží spojit konkrétní tváře s Tymio. Lékaři jsou přirozeně citováni v médiích. Roste důvěra v online prostředí (komentáře, zpětná vazba, NPS). Web obsahuje profily klíčových odborníků.",
      description: "Budujeme důvěru skrze konkrétní tváře a příběhy, posilujeme vnímání odbornosti a lidskosti, propojujeme medical tým s HQ i navenek, odlišujeme se od neosobních telemedicínských řešení. Nejde jen o fotky - jde o reputaci značky jako skutečné kliniky.",
      product: "Tymio app", domain: "Klient", owner: "Nelca",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-01-15", targetDate: "2026-06-30", milestoneDate: "2026-03-31",
      dateConfidence: DateConfidence.HIGH, arrImpact: 30000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 4, Lékař: 3, Zaměstnavatel: 2, Pojišťovna: 2, "B2B Admin": 2, Regulátor: 1 },
      revenueWeights: { B2B: 15, B2G2C: 15, B2C: 50, Pojištění: 10, B2B2C: 10 },
      raci: { accountable: "Nelca", implementer: "Marek", consulted: ["Ondra"], informed: ["Kuba", "Adela"] },
      features: [
        { title: "Profily lékařů na webu", description: "Profesionální profily s fotkami a popisem specializace na webu Tymio.", status: FeatureStatus.DONE, startDate: "2026-01-15", targetDate: "2026-02-28", requirements: ["Profesionální fotografie", "Medailonky lékařů + sester", "SEO optimalizace"] },
        { title: "Ambasadorský program Tymio", description: "3-5 hlavních ambasadorů Tymio pro PR a odborné komentáře v médiích.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-02-01", targetDate: "2026-03-31", requirements: ["Výběr ambasadorů", "Mediální příprava lékařů", "Kvartální plán výstupů"] },
        { title: "Video rozhovory s medical týmem", description: "Série video rozhovorů a reels s lékaři a sestrami pro sociální sítě.", status: FeatureStatus.PLANNED, startDate: "2026-03-01", targetDate: "2026-05-31", requirements: ["Produkce focení a videa", "Redakční plán", "Spolupráce medical × marketing"] },
      ],
      milestones: [
        { title: "Vlastní fotky na webu s popisem kdo co dělá - HOTOVO", targetDate: "2026-02-28", status: MilestoneStatus.DONE, owner: "Nelca" },
        { title: "Definovat 3-5 hlavních ambasadorů Tymio - HOTOVO s Lesensky", targetDate: "2026-02-28", status: MilestoneStatus.DONE, owner: "Nelca" },
        { title: "Spustit rozhovory s medical týmem", targetDate: "2026-04-30", status: MilestoneStatus.TODO, owner: "Nelca" },
      ],
      kpis: [
        { title: "Mediální výstupy s experty Tymio měsíčně", targetValue: "3", currentValue: "1", unit: "výstupy/měsíc", targetDate: "2026-06-30" },
        { title: "NPS skóre", targetValue: "93", currentValue: "92.6", unit: "%", targetDate: "2026-06-30" },
      ],
      stakeholders: [
        { name: "CEO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "Marek Dvořák", role: StakeholderRole.AMBASSADOR, type: StakeholderType.INTERNAL, organization: "Tymio" },
        { name: "Lesensky.cz", role: StakeholderRole.REVIEWER, type: StakeholderType.EXTERNAL, organization: "PR agentura" },
      ],
      risks: [
        { title: "Nedostatek kapacity medical týmu pro PR", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Vytvořit malou skupinu ambasadorů (ne všichni musí být viditelní). Jednoduchý formát spolupráce (1 rozhovor za kvartál).", owner: "Nelca" },
        { title: "Nízká ochota lékařů vystupovat veřejně", probability: "MEDIUM", impact: "LOW", mitigation: "Mít více tváří, nepostavit komunikaci jen na jedné. Interní příprava lékařů.", owner: "Nelca" },
      ],
      notes: "Potřebné zdroje: Medical tým (ochota vystupovat) + sestry, marketing (strategie, koordinace, obsah), fotograf/videomaker, PR podpora, copywriter. Finance: produkce focení a videa, PR spolupráce, eventy.",
    },
    // ── 4. Checklist všech věcí / nastavení očekávání (Klient) ──
    {
      title: "Checklist všech věcí / nastavení očekávání",
      problemStatement: "V jakémkoliv momentu, kdy klient přijde do kontaktu s Tymio, má správně nastavená očekávání.",
      successCriteria: "Klienti budou přesně vědět, za co platí. Správné disclaimery na správném místě. Klient vždy ví, zda je dotaz u sestřiček, lékaře nebo musí doplnit něco pacient (UBER efekt).",
      description: "Systematický přístup k nastavení očekávání ve všech kontaktních bodech: web, landing page, registrace, odeslání dotazu, eRecept, termín, prevence. Zahrnuje revizi UX textů, disclaimerů, potvrzovacích obrazovek a notifikací.",
      product: "Tymio app", domain: "Klient", owner: "Kuba",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CHURN_PREVENTER,
      startDate: "2026-02-01", targetDate: "2026-06-30", milestoneDate: "2026-04-15",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 40000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 5, Lékař: 3, Zaměstnavatel: 3, Pojišťovna: 2, "B2B Admin": 2, Regulátor: 2 },
      revenueWeights: { B2B: 15, B2G2C: 15, B2C: 45, Pojištění: 15, B2B2C: 10 },
      raci: { accountable: "Kuba", implementer: "David", consulted: ["Nelca", "Marek"], informed: ["Ondra"] },
      features: [
        { title: "UBER efekt - zobrazení stavu případů", description: "Klient vždy vidí, zda je jeho dotaz u sestřiček, lékaře nebo musí doplnit něco pacient.", status: FeatureStatus.PLANNED, startDate: "2026-03-01", targetDate: "2026-05-15", requirements: ["Backend status tracking", "UX zobrazení stavu", "Push notifikace při změně stavu"] },
        { title: "Revize onboardovacích sekvencí", description: "Nové onboardovací sekvence s jasně nastavenými očekáváními pro nové uživatele.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-02-15", targetDate: "2026-03-31", requirements: ["Revize textů e-mailingu", "Nové transakční maily", "Nové care maily"] },
        { title: "IoT integrace v1.0", description: "Spuštění IoT sběru dat pro automatický monitoring zdraví klientů.", status: FeatureStatus.PLANNED, startDate: "2026-03-15", targetDate: "2026-06-15", requirements: ["IoT device pairing", "Dashboard zdravotních metrik", "Alerting při anomáliích"] },
      ],
      milestones: [
        { title: "Spuštění IoTs v1.0", targetDate: "2026-03-15", status: MilestoneStatus.TODO, owner: "Kuba" },
        { title: "Spuštění nových onboardovacích sekvencí", targetDate: "2026-03-10", status: MilestoneStatus.IN_PROGRESS, owner: "Kuba" },
        { title: "MAKE UX GREAT AGAIN", status: MilestoneStatus.TODO, owner: "David" },
      ],
      kpis: [
        { title: "Otevření notifikací", targetValue: "60", currentValue: "0", unit: "%", targetDate: "2026-06-30" },
        { title: "NPS po konzultaci", targetValue: "90", currentValue: "85.7", unit: "%", targetDate: "2026-06-30" },
      ],
      stakeholders: [
        { name: "David", role: StakeholderRole.REVIEWER, type: StakeholderType.INTERNAL, organization: "UX" },
        { name: "Jakub Justra", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL, organization: "COO" },
      ],
      risks: [
        { title: "Příliš mnoho disclaimerů zhorší UX", probability: "MEDIUM", impact: "MEDIUM", mitigation: "UX testování s reálnými uživateli. Pilotní testování na menší skupině.", owner: "David" },
      ],
      notes: "Potřebné zdroje: UX, Backend, Marketing, David, Jakub. Kontaktní body: web/LP, registrace, odeslání dotazu, potvrzení, eRecept, termín, prevence, B2C nákup. B2B: zaměstnavatelé očekávají kontrolu přístupu, platící klienti chtějí podrobné reporty.",
    },
    // ── 5. B2G2C - kraje (Tržby) ───────────────────────────────
    {
      title: "B2G2C (kraje)",
      problemStatement: "Org. složky státu nakupují Tymio pro své občany.",
      successCriteria: "500 000 lidí v dosahu. Pozitivní mediální výstup. 0 kritických připomínek před spuštěním.",
      description: "Prodej a nasazení služby Tymio pro orgány státní správy - kraje, města a municipality. Zahrnuje jednání se zastupitelstvy, mediální management (zejména po Znojmu), a onboarding přes ambasadory z orgánů.",
      product: "B2B Platforma", domain: "Tržby", owner: "Adela",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-01-01", targetDate: "2026-09-30", milestoneDate: "2026-06-30",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 510000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Pacient: 4, Lékař: 2, Zaměstnavatel: 1, Pojišťovna: 2, "B2B Admin": 4, Regulátor: 3 },
      revenueWeights: { B2B: 5, B2G2C: 70, B2C: 5, Pojištění: 10, B2B2C: 10 },
      raci: { accountable: "Adela", implementer: "Ondra", consulted: ["Vasek", "Nelca"], informed: ["Kuba"] },
      features: [
        { title: "Klientský dashboard pro orgány", description: "Dashboard pro orgány státní správy zobrazující enrollment, využití a zdravotní statistiky občanů.", status: FeatureStatus.PLANNED, startDate: "2026-04-01", targetDate: "2026-07-30", requirements: ["Konfigurovatelné KPI widgety", "Export CSV/PDF", "Filtrování podle data"] },
        { title: "Onboarding občanů", description: "Tok registrace a aktivace občanů přes orgán státní správy.", status: FeatureStatus.IDEA, startDate: "2026-05-01", targetDate: "2026-08-15", requirements: ["CSV import občanů", "Emailové pozvánkové sekvence", "Sledování aktivace"] },
      ],
      milestones: [
        { title: "Vyžehlit mediální obraz po Znojmu", targetDate: "2026-06-30", status: MilestoneStatus.IN_PROGRESS, owner: "Adela" },
        { title: "Představení Adély orgánům", targetDate: "2026-03-31", status: MilestoneStatus.DONE, owner: "Adela" },
        { title: "Summary - svazy/asociace/partneři", targetDate: "2026-03-31", status: MilestoneStatus.IN_PROGRESS, owner: "Adela" },
      ],
      kpis: [
        { title: "Lidé v dosahu služby", targetValue: "500000", currentValue: "120589", unit: "osob", targetDate: "2026-09-30" },
        { title: "Pozitivní mediální výstupy", targetValue: "10", currentValue: "0", unit: "výstupů", targetDate: "2026-09-30" },
      ],
      stakeholders: [
        { name: "Zastupitelstvo / orgán", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL },
        { name: "Ambasador z orgánu", role: StakeholderRole.AMBASSADOR, type: StakeholderType.EXTERNAL },
        { name: "Svazy a asociace", role: StakeholderRole.SPONSOR, type: StakeholderType.EXTERNAL },
      ],
      risks: [
        { title: "Konkurence", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Diferenciace přes kvalitu služby a NPS.", owner: "Adela" },
        { title: "Rozpadl se onboarding", probability: "MEDIUM", impact: "HIGH", mitigation: "Testování onboardingu před každým novým orgánem.", owner: "Ondra" },
        { title: "Změna vedení orgánu", probability: "LOW", impact: "HIGH", mitigation: "Budovat vztahy na více úrovních.", owner: "Adela" },
        { title: "Launch ohrozí funkčnost stávajícího portfolia", probability: "LOW", impact: "HIGH", mitigation: "Špatný planning změn - zavést kvartální rolling budget.", owner: "Ondra" },
      ],
      notes: "Potřebné zdroje: ambasador z orgánu, svazy/asociace/partneři, tým Tymio. Neupřímnost v týmu = neřekneme si problémy - to je kulturní riziko.",
    },
    // ── 6. Telco B2B (Tržby) ───────────────────────────────────
    {
      title: "Distribuce Tymio přes telekomunikační společnosti",
      problemStatement: "Rozjezd obchodní spolupráce a distribuce přes telekomunikační společnosti.",
      successCriteria: "Maximálně automatizované procesy: onboarding, platby, provize, storno, změna balíčku. Zasmluvněná první telco společnost, běžící pilotní program prodeje bez vážnějších chyb.",
      description: "White-label zdravotní služby pro české telco operátory. Embed služeb Tymio do zaměstnaneckých benefit balíčků telco společností.",
      product: "B2B Platforma", domain: "Tržby", owner: "Vasek",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-03-01", targetDate: "2026-10-31", milestoneDate: "2026-08-01",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 280000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Pacient: 3, Lékař: 2, Zaměstnavatel: 5, Pojišťovna: 2, "B2B Admin": 4, Regulátor: 1 },
      revenueWeights: { B2B: 55, B2G2C: 5, B2C: 10, Pojištění: 10, B2B2C: 20 },
      raci: { accountable: "Vasek", implementer: "Ondra", consulted: ["Adela", "Sergei"], informed: ["Kuba", "Nelca"] },
      features: [
        { title: "Telco SSO integrace", description: "Single sign-on přes telco identity providery pro bezproblémový onboarding zaměstnanců.", status: FeatureStatus.IDEA, startDate: "2026-06-01", targetDate: "2026-08-15", requirements: ["OAuth adaptery pro telco", "User provisioning webhooks", "Automatizovaný onboarding"] },
        { title: "Predikční model kapacit", description: "Model predikce trafficu medical týmu pro plánování kapacit před náběhem telco partnerů.", status: FeatureStatus.IDEA, startDate: "2026-04-01", targetDate: "2026-05-31", requirements: ["Analýza historických dat", "Predikční algoritmus", "Dashboard kapacit"] },
      ],
      milestones: [
        { title: "Definice byznys modelu (B2B jako Uniqa, nebo B2B2C jako makléř?)", targetDate: "2026-03-31", status: MilestoneStatus.TODO, owner: "Vasek" },
        { title: "Predikční model kapacit/trafficu medical týmu", targetDate: "2026-05-31", status: MilestoneStatus.TODO, owner: "Vasek" },
        { title: "Validace technických a procesních kvalit", status: MilestoneStatus.TODO, owner: "Ondra" },
      ],
      kpis: [
        { title: "Zasmluvněné telco společnosti", targetValue: "1", currentValue: "0", unit: "společností", targetDate: "2026-10-31" },
        { title: "Automatizace procesů", targetValue: "100", currentValue: "0", unit: "%", targetDate: "2026-10-31" },
      ],
      stakeholders: [
        { name: "Vedení telco společností", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL },
        { name: "Ondra", role: StakeholderRole.SPONSOR, type: StakeholderType.INTERNAL, organization: "Tymio" },
      ],
      risks: [
        { title: "Chyby v procesech a aplikaci - telco je náročný partner", probability: "MEDIUM", impact: "HIGH", mitigation: "Odladit všechny procesy na menších partnerech.", owner: "Ondra" },
        { title: "Nedostatečná kapacita medical týmu", probability: "MEDIUM", impact: "HIGH", mitigation: "Predikční model kapacit, zefektivnění ergonomie práce.", owner: "Vasek" },
      ],
      notes: "Potřebné zdroje: vyjasněný byznys model, 100% procesy a precizně popsané metodiky, dostatečné kapacity medical týmu, silný positioning pro telco.",
    },
    // ── 7. 20 firem / B2B obchod (Tržby) ───────────────────────
    {
      title: "20 firem (B2B obchod)",
      problemStatement: "Společnosti a instituce nakupují službu Tymio pro své zaměstnance. Cílem je 20 nových firem, z toho 10 velkých nad 3000 zaměstnanců.",
      successCriteria: "20 nových firem jako zákazníků Tymio, 10 velkých firem nad 3000 zaměstnanců. Pozitivní povědomí o Tymio skrz B2B trh.",
      description: "Škálování B2B prodeje na 20 simultánních klientů. Zahrnuje automatizaci onboardingu, komunikační materiály, partnerství s benefitními společnostmi, a stabilní analytiku pro klienty.",
      product: "B2B Platforma", domain: "Tržby", owner: "Adela",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.UPSELL_DRIVER,
      startDate: "2026-03-01", targetDate: "2026-12-15", milestoneDate: "2026-09-30",
      dateConfidence: DateConfidence.LOW, arrImpact: 350000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Pacient: 2, Lékař: 1, Zaměstnavatel: 5, Pojišťovna: 3, "B2B Admin": 5, Regulátor: 1 },
      revenueWeights: { B2B: 60, B2G2C: 10, B2C: 5, Pojištění: 10, B2B2C: 15 },
      raci: { accountable: "Adela", implementer: "Vasek", consulted: ["Ondra", "Kuba"], informed: ["Nelca", "Pavel"] },
      features: [
        { title: "Automatizovaný onboarding klientů", description: "Self-service onboarding s nahráním smlouvy, brand konfigurací a migrací dat.", status: FeatureStatus.IDEA, startDate: "2026-07-15", targetDate: "2026-10-01", requirements: ["Multi-tenant provisioning", "Onboarding checklist engine", "Welcome email automatizace"] },
        { title: "Funkční analytika a reporting", description: "Reporty pro B2B klienty ukazující ROI programu, využití a zdravotní metriky.", status: FeatureStatus.IDEA, startDate: "2026-05-01", targetDate: "2026-08-30", requirements: ["Multi-tenant data izolace", "Generování PDF reportů", "Export API"] },
      ],
      milestones: [
        { title: "Komunikační materiály pro prezentace a onboarding", targetDate: "2026-02-28", status: MilestoneStatus.DONE, owner: "Nelca" },
        { title: "Partnerství s min 2 organizacemi", targetDate: "2026-03-31", status: MilestoneStatus.IN_PROGRESS, owner: "Adela" },
        { title: "Dotažení PwC CZ + SK pro referenci", targetDate: "2026-02-28", status: MilestoneStatus.DONE, owner: "Vasek" },
      ],
      kpis: [
        { title: "Počet B2B klientů", targetValue: "20", currentValue: "5", unit: "firem", targetDate: "2026-12-15" },
        { title: "Velké firmy nad 3000 zaměstnanců", targetValue: "10", currentValue: "2", unit: "firem", targetDate: "2026-12-15" },
      ],
      stakeholders: [
        { name: "HR oddělení firem", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL },
        { name: "CFO/CEO firem", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL },
        { name: "Benefitní společnosti", role: StakeholderRole.AMBASSADOR, type: StakeholderType.EXTERNAL },
      ],
      risks: [
        { title: "Negativní zpětná vazba na onboarding", probability: "MEDIUM", impact: "HIGH", mitigation: "Testovat onboarding s každým novým klientem. Sledovat drop-off rate.", owner: "Ondra" },
        { title: "Zdvojená anamnéza v app", probability: "HIGH", impact: "MEDIUM", mitigation: "UX redesign anamnézy před B2B scale.", owner: "David" },
        { title: "Špatný odhad kapacit IT a Medical", probability: "MEDIUM", impact: "HIGH", mitigation: "Predikční model. Kvartální rolling budget.", owner: "Ondra" },
      ],
      notes: "Potřebné zdroje: propagace (komunikační materiály, LinkedIn), partneři (benefitní společnosti, recruitment společnosti, makléři typu AON), eventy (HR akce, konference), jednoduchý onboarding, funkční analytika, stávající klienti jako reference.",
    },
    // ── 8. Úhrady z pojišťoven CZ + SK (Tržby) ────────────────
    {
      title: "Úhrady z pojišťoven - interna a dermatologie (CZ + SK)",
      problemStatement: "Získat smlouvy na odbornost interna a dermatologie - v ČR s OZP přes výběrové řízení na Magistrátu hl. m. Prahy a na Slovensku přímo s UNION pojišťovnou.",
      successCriteria: "CZ: Úspěšné výběrové řízení, smlouva s OZP, bezchybné vykazování. SK: Smlouva s UNION, zakontrahované ordinace. Obě země: kliniky neodmítají žádanky, lékárny recepty, přinesli jsme pojišťovně nové pojištěnce.",
      description: "Integrace s českými a slovenskými pojišťovnami pro přímé podávání nároků a platební vyrovnání. Kritické pro revenue model. CZ: OZP výběrové řízení (4.3.), SK: UNION přímá smlouva.",
      product: "Integrační platforma", domain: "Tržby", owner: "Ondra",
      priority: Priority.P0, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-02-01", targetDate: "2026-06-30", milestoneDate: "2026-04-30",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 550000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Pacient: 2, Lékař: 5, Zaměstnavatel: 1, Pojišťovna: 5, "B2B Admin": 2, Regulátor: 4 },
      revenueWeights: { B2B: 5, B2G2C: 5, B2C: 5, Pojištění: 80, B2B2C: 5 },
      raci: { accountable: "Ondra", implementer: "Kuba", consulted: ["Adela", "Sergei"], informed: ["Vasek"] },
      features: [
        { title: "Vykazování výkonů CZ (OZP)", description: "Automatizované vykazování výkonů vůči OZP podle českých pravidel. DASTA protokol.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-02-15", targetDate: "2026-04-30", requirements: ["DASTA XML builder", "Polling stavu nároků", "Workflow pro rekonciliaci chyb"] },
        { title: "Vykazování výkonů SK (UNION)", description: "Nastavení vykazování výkonů pro UNION pojišťovnu na Slovensku.", status: FeatureStatus.PLANNED, startDate: "2026-03-01", targetDate: "2026-05-31", requirements: ["SK smluvní dokumentace", "Provozní nastavení ordinací", "Kódy výkonů SK"] },
        { title: "Interní kontrola výkonů CZ + SK", description: "Proces interní kontroly před odesláním na pojišťovnu - prevence vratek.", status: FeatureStatus.PLANNED, startDate: "2026-04-01", targetDate: "2026-06-15", requirements: ["Kontrolní checklist", "Automatická validace", "Dashboard vratek"] },
      ],
      milestones: [
        { title: "Finalizovat dokumentaci k výběrovému řízení na Magistrátu Prahy", targetDate: "2026-03-04", status: MilestoneStatus.DONE, owner: "Ondra" },
        { title: "Finalizovat smlouvu s UNION (interna + derma)", targetDate: "2026-03-31", status: MilestoneStatus.IN_PROGRESS, owner: "Ondra" },
        { title: "Nastavit proces vykazování a interní kontrolu CZ + SK", targetDate: "2026-04-30", status: MilestoneStatus.TODO, owner: "Kuba" },
      ],
      kpis: [
        { title: "Smlouvy s pojišťovnami", targetValue: "2", currentValue: "0", unit: "smluv", targetDate: "2026-06-30" },
        { title: "Chybovost vykazování (vratky)", targetValue: "0", currentValue: "0", unit: "%", targetDate: "2026-06-30" },
        { title: "Noví pojištěnci přivedení pojišťovně", targetValue: "1000", currentValue: "0", unit: "pojištěnců", targetDate: "2026-06-30" },
      ],
      stakeholders: [
        { name: "Magistrát hl. m. Prahy (výběrová komise)", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL, organization: "Magistrát Praha" },
        { name: "OZP (smluvní oddělení)", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL, organization: "OZP" },
        { name: "UNION pojišťovna SK", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL, organization: "UNION" },
        { name: "CEO", role: StakeholderRole.SPONSOR, type: StakeholderType.INTERNAL },
      ],
      risks: [
        { title: "Neúspěch ve výběrovém řízení (4.3.)", probability: "MEDIUM", impact: "HIGH", mitigation: "Precizní příprava podkladů.", owner: "Ondra" },
        { title: "Zdržení podpisu smlouvy s UNION SK", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Paralelní příprava provozního nastavení.", owner: "Ondra" },
        { title: "Cash-flow tlak v náběhové fázi", probability: "HIGH", impact: "HIGH", mitigation: "Rezerva v cash-flow na první měsíce provozu. Kontrola ekonomiky před spuštěním.", owner: "Ondra" },
        { title: "Chyby ve vykazování = vratky", probability: "MEDIUM", impact: "HIGH", mitigation: "Testovací fáze vykazování (interní kontrola před odesláním).", owner: "Kuba" },
        { title: "Nedostatek lékařů nebo jejich výpadek", probability: "MEDIUM", impact: "HIGH", mitigation: "Smluvní zajištění lékařů. Personální stabilita.", owner: "Ondra" },
      ],
      notes: "Potřebné zdroje: Lékaři interna + dermatologie, právník (smlouvy CZ+SK), ekonomika (modelace úhrad), IT (vykazování), administrativa (dokumentace). Finance: příprava VŘ, právní služby, provozní náklady ordinací do náběhu úhrad.",
    },
    // ── 9. B2B2C makléři, platby, pilot B2C (Tržby) ────────────
    {
      title: "B2B2C (makléři, platby, pilot B2C, VIP balíček)",
      problemStatement: "Postavení efektivních procesů a rozjezd distribuce Tymio přes makléře, případně napřímo (B2C) v rámci kampaňových příležitostí.",
      successCriteria: "Maximálně automatizované procesy: onboarding, platby, provize, storno, změna balíčku. Zasmluvněný první makléř, běžící pilotní program. Pozitivní zpětná vazba. Spuštěná vlastní kampaň na bývalé B2B klienty.",
      description: "Distribuce Tymio přes makléře (Broker Trust), zavedení platebních procesů, provizního systému a pilotní B2C prodej z odpadu B2B. Budování vlastního kmene klientů.",
      product: "B2B Platforma", domain: "Tržby", owner: "Vasek",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.UPSELL_DRIVER,
      startDate: "2026-03-01", targetDate: "2026-05-31", milestoneDate: "2026-03-31",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 160000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Pacient: 3, Lékař: 1, Zaměstnavatel: 2, Pojišťovna: 2, "B2B Admin": 3, Regulátor: 1 },
      revenueWeights: { B2B: 10, B2G2C: 5, B2C: 30, Pojištění: 5, B2B2C: 50 },
      raci: { accountable: "Vasek", implementer: "Sergei", consulted: ["Ondra", "Kuba"], informed: ["Nelca"] },
      features: [
        { title: "Platební systém", description: "Integrace plateb - onboarding, provize makléřům, storno, změna balíčku.", status: FeatureStatus.IDEA, startDate: "2026-03-15", targetDate: "2026-05-31", requirements: ["Payment gateway integrace", "Provizní kalkulačka", "Storno a refund flow"] },
        { title: "Makléřský onboarding", description: "Proces zasmluvnění a onboardingu makléřů, včetně dokumentace a podmínek.", status: FeatureStatus.PLANNED, startDate: "2026-03-01", targetDate: "2026-03-31", requirements: ["Smluvní dokumentace", "Design procesů", "Školení makléřů"] },
      ],
      milestones: [
        { title: "Hotová dokumentace/podmínky pro zasmluvnění makléře", targetDate: "2026-03-13", status: MilestoneStatus.TODO, owner: "Vasek" },
        { title: "Design procesů: platby, provize, onboarding, storno, změna balíčku", targetDate: "2026-03-31", status: MilestoneStatus.TODO, owner: "Vasek" },
        { title: "Vyvinuté platby, provize a onboarding", targetDate: "2026-05-31", status: MilestoneStatus.TODO, owner: "Sergei" },
      ],
      kpis: [
        { title: "Zasmluvnění makléři", targetValue: "1", currentValue: "0", unit: "makléřů", targetDate: "2026-05-31" },
        { title: "Vlastní kmenový klienti (B2C)", targetValue: "100", currentValue: "0", unit: "klientů", targetDate: "2026-05-31" },
      ],
      stakeholders: [
        { name: "Vedení Broker Trust", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL, organization: "Broker Trust" },
        { name: "Ondra", role: StakeholderRole.SPONSOR, type: StakeholderType.INTERNAL },
      ],
      risks: [
        { title: "Vývojové kapacity", probability: "HIGH", impact: "HIGH", mitigation: "Mít rozjezd B2C jako klíčovou prioritu - budování vlastního kmene nezatíženého provizemi.", owner: "Ondra" },
        { title: "Chyby v procesech - reputační riziko pro makléře", probability: "MEDIUM", impact: "HIGH", mitigation: "Důkladné testování před spuštěním. Pilotní fáze.", owner: "Vasek" },
      ],
      notes: "Potřebné zdroje: IT kapacity na vývoj, design procesů, finance na marketing - promo akce s makléři (konference, školení). B2C jako klíčová priorita z pohledu obchodního potenciálu.",
    },
    // ── 10. Za hranice obvyklého (Nad rámec) ────────────────────
    {
      title: "Za hranice obvyklého (push, očkování, bonusy)",
      problemStatement: "Posouváme roli Tymio z poskytovatele péče na aktivního zdravotního partnera - proaktivně upozorňujeme klienty na příležitosti a preventivní kroky.",
      successCriteria: "Klienti vnímají Tymio jako aktivního partnera. Roste využívání bonusů pojišťoven. Roste proočkovanost a účast na prevenci. XY % otevření notifikací, XY % využitých bonusů.",
      description: "Proaktivní upozornění na bonusy zdravotních pojišťoven, blížící se termíny očkování/přeočkování, preventivní prohlídky. Jít za hranice obvyklého telemedicínského servisu.",
      product: "Tymio app", domain: "Nad rámec obvyklého", owner: "Nelca",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-03-01", targetDate: "2026-06-30", milestoneDate: "2026-05-01",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 50000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 5, Lékař: 3, Zaměstnavatel: 2, Pojišťovna: 4, "B2B Admin": 2, Regulátor: 2 },
      revenueWeights: { B2B: 10, B2G2C: 15, B2C: 40, Pojištění: 25, B2B2C: 10 },
      raci: { accountable: "Nelca", implementer: "David", consulted: ["Kuba", "Marek"], informed: ["Ondra"] },
      features: [
        { title: "Přehled bonusů pojišťoven", description: "Zmapování a zobrazení bonusů všech relevantních pojišťoven v aplikaci.", status: FeatureStatus.IDEA, startDate: "2026-03-01", targetDate: "2026-04-30", requirements: ["Databáze bonusů pojišťoven", "Personalizace podle pojišťovny klienta", "Pravidelná aktualizace"] },
        { title: "Očkovací a preventivní notifikace", description: "Automatické notifikace o blížících se termínech očkování a preventivních prohlídek.", status: FeatureStatus.IDEA, startDate: "2026-04-01", targetDate: "2026-05-31", requirements: ["Očkovací kalendáře podle věku", "Logika notifikací (kdo, kdy, proč)", "Multi-channel delivery (push/SMS/email)"] },
        { title: "MVP řešení notifikací", description: "Pilotní testování proaktivních notifikací na menší skupině uživatelů.", status: FeatureStatus.IDEA, startDate: "2026-04-15", targetDate: "2026-06-15", requirements: ["A/B testování", "Měření open rate", "Personalizace podle věku/pohlaví/profilu"] },
      ],
      milestones: [
        { title: "Zmapovat bonusy všech relevantních pojišťoven", targetDate: "2026-04-30", status: MilestoneStatus.TODO, owner: "Nelca" },
        { title: "Definovat logiku očkovacích a preventivních notifikací", targetDate: "2026-04-30", status: MilestoneStatus.TODO, owner: "Kuba" },
        { title: "Navrhnout MVP řešení notifikací a otestovat na pilotní skupině", targetDate: "2026-06-15", status: MilestoneStatus.TODO, owner: "David" },
      ],
      kpis: [
        { title: "Otevření notifikací", targetValue: "50", currentValue: "0", unit: "%", targetDate: "2026-06-30" },
        { title: "Využité bonusy přes Tymio", targetValue: "100", currentValue: "0", unit: "bonusů", targetDate: "2026-06-30" },
        { title: "Proočkovanost klientů", targetValue: "80", currentValue: "0", unit: "%", targetDate: "2026-06-30" },
      ],
      stakeholders: [
        { name: "CEO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "Medical tým", role: StakeholderRole.MEDICAL, type: StakeholderType.INTERNAL },
        { name: "Zdravotní pojišťovny", role: StakeholderRole.SPONSOR, type: StakeholderType.EXTERNAL },
      ],
      risks: [
        { title: "Příliš mnoho notifikací - klient je začne ignorovat", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Jasná pravidla frekvence notifikací. Personalizace.", owner: "Nelca" },
        { title: "Nepřesná nebo neaktuální data o bonusech", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Pravidelná aktualizace bonusů pojišťoven.", owner: "Nelca" },
        { title: "Zkomplikování UX appky", probability: "LOW", impact: "MEDIUM", mitigation: "Jednoduché a srozumitelné UX. Pilotní testování.", owner: "David" },
      ],
      notes: "Potřebné zdroje: Vývoj, UX (David), Medical tým (definice doporučení a logiky), Marketing (srozumitelná komunikace). Finance: vývoj appky, případná integrace s pojišťovnami.",
    },
    // ── 11. Medicínské guidelines (Nad rámec) ──────────────────
    {
      title: "Medicínské guidelines",
      problemStatement: "Tymio jako poskytovatel telemedicíny hledá nejrychlejší a nejefektivnější způsoby péče, a proto je pro bezpečí pacientů i z legislativních důvodů naší povinností vytvořit vlastní telemedicínské guidelines.",
      successCriteria: "Komplexní popis JAK nakládáme se zdravotními případy, PROČ tak s nimi nakládáme. Jasně nastavena odpovědnost (Tymio, lékařů i sester). Konkurenční výhoda. Razítko právní kanceláře nebo profesora z akademie věd.",
      description: "Evidence-based systém klinického rozhodování. Vlastní telemedicínské guidelines, protože spoléhat na jejich vytvoření státním aparátem je nejisté. Zahrnuje mapování stávajících postupů, právní audit, konzultace s lékaři.",
      product: "Tymio app", domain: "Nad rámec obvyklého", owner: "Kuba",
      priority: Priority.P2, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.COMPLIANCE_GATE,
      startDate: "2026-03-01", targetDate: "2026-11-30", milestoneDate: "2026-09-01",
      dateConfidence: DateConfidence.LOW, arrImpact: 55000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 3, Lékař: 5, Zaměstnavatel: 1, Pojišťovna: 4, "B2B Admin": 1, Regulátor: 5 },
      revenueWeights: { B2B: 5, B2G2C: 20, B2C: 25, Pojištění: 45, B2B2C: 5 },
      raci: { accountable: "Kuba", implementer: "Marek", consulted: ["Jitka", "Ondra"], informed: ["Nelca", "Martina"] },
      features: [
        { title: "Mapování stávajících postupů", description: "Sepisování a mapování stávajících lékařských postupů a identifikované problémy.", status: FeatureStatus.IDEA, startDate: "2026-04-01", targetDate: "2026-07-30", requirements: ["Analýza dekurzů", "AI analýza dat", "Konzultace s lékařskými garanty"] },
        { title: "Právní audit guidelines", description: "Právní audit telemedicínských guidelines ve vztahu k legislativě a pojišťovnám.", status: FeatureStatus.IDEA, startDate: "2026-03-01", targetDate: "2026-05-31", requirements: ["Právní konzultace", "Legislativní rámec telemedicíny", "Vzor guidelines dokumentu"] },
      ],
      milestones: [
        { title: "Právní audit", status: MilestoneStatus.TODO, owner: "Kuba" },
        { title: "Začít sepisovat a mapovat stávající postupy a problémy", status: MilestoneStatus.TODO, owner: "Marek" },
        { title: "Meeting s lékařskými garanty nad dekurzy", status: MilestoneStatus.TODO, owner: "Kuba" },
      ],
      kpis: [
        { title: "Pokryté odbornosti guidelines", targetValue: "5", currentValue: "0", unit: "odborností", targetDate: "2026-11-30" },
        { title: "Guidelines s právním razítkem", targetValue: "3", currentValue: "0", unit: "guidelines", targetDate: "2026-11-30" },
      ],
      stakeholders: [
        { name: "Zákon / Legislativa", role: StakeholderRole.LEGAL, type: StakeholderType.EXTERNAL },
        { name: "CEO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "COO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "Lékaři (garanti)", role: StakeholderRole.MEDICAL, type: StakeholderType.INTERNAL },
      ],
      risks: [
        { title: "Pojišťovny vs. smlouva s pojišťovnou - guidelines musí být kompatibilní", probability: "MEDIUM", impact: "HIGH", mitigation: "Paralelní konzultace s pojišťovnami.", owner: "Kuba" },
        { title: "Objem - příliš mnoho postupů k zpracování", probability: "HIGH", impact: "MEDIUM", mitigation: "Prioritizace podle rizika a frekvence. Postupné zpracování.", owner: "Kuba" },
        { title: "Vyhoření lékařů nad rámec služeb telemedicíny", probability: "MEDIUM", impact: "HIGH", mitigation: "Stabilní appka. Symptom checker. Kontinuita.", owner: "Ondra" },
      ],
      notes: "Potřebné zdroje: ČAS, analytika a AI, dekurzy a analýzy, velké množství lékařských konzultací, velké množství textu, právní konzultace (peníze). V případě studií pomoc akademické obce. KONTINUITU.",
    },
    // ── 12. Marketingová podpora obchodu (B2B) ─────────────────
    {
      title: "Marketingová podpora obchodu",
      problemStatement: "Hledáme způsoby, jak pomoct obchodu lépe prezentovat Tymio - dodáváme, co obchod potřebuje a současně komunikujeme naše why a hodnoty.",
      successCriteria: "Obchod používá jednotnou aktualizovanou prezentaci. Existuje základní B2B toolkit (prezentace, 1-pager, case study, FAQ). Roste počet kvalifikovaných sales leadů. Zkracuje se čas přípravy podkladů.",
      description: "Strategická marketingová podpora B2B obchodu: jednotná prezentace, B2B toolkit, case studies, eventová podpora, landing page. Sjednocení messagingu (why, hodnoty, positioning). Posílení důvěryhodnosti značky při jednáních.",
      product: "B2B Platforma", domain: "B2B", owner: "Nelca",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-01-15", targetDate: "2026-06-15", milestoneDate: "2026-03-31",
      dateConfidence: DateConfidence.HIGH, arrImpact: 120000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Pacient: 1, Lékař: 1, Zaměstnavatel: 4, Pojišťovna: 2, "B2B Admin": 5, Regulátor: 1 },
      revenueWeights: { B2B: 50, B2G2C: 25, B2C: 5, Pojištění: 10, B2B2C: 10 },
      raci: { accountable: "Nelca", implementer: "Marek", consulted: ["Ondra", "Adela"], informed: ["Kuba"] },
      features: [
        { title: "B2B toolkit", description: "Základní B2B toolkit: 1-pager, case study, FAQ, e-mailový template, landing page.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-02-01", targetDate: "2026-03-31", requirements: ["1-pager design", "Case study PwC", "FAQ dokument", "Email template", "Landing page"] },
        { title: "Jednotná obchodní prezentace", description: "Jednotná prezentace firmy v CZ, EN, SK verzích.", status: FeatureStatus.DONE, startDate: "2026-01-15", targetDate: "2026-02-28", requirements: ["CZ verze", "EN verze", "SK verze"] },
        { title: "Promo stánek na konference", description: "Příprava promočního stánku a materiálů pro B2B konference a HR akce.", status: FeatureStatus.IDEA, startDate: "2026-04-01", targetDate: "2026-06-15", requirements: ["Design stánku", "Promo materiály", "Kalendář akcí"] },
      ],
      milestones: [
        { title: "Jednotná prezentace pro obchod (CZ, EN, SK) - HOTOVO", targetDate: "2026-02-28", status: MilestoneStatus.DONE, owner: "Nelca" },
        { title: "Kalendář akcí - HOTOVO", targetDate: "2026-02-15", status: MilestoneStatus.DONE, owner: "Nelca" },
        { title: "Základní B2B toolkit (1-pager, case study, FAQ, email, LP) - ZADÁNO", targetDate: "2026-03-31", status: MilestoneStatus.IN_PROGRESS, owner: "Nelca" },
      ],
      kpis: [
        { title: "Kvalifikované sales leady", targetValue: "50", currentValue: "10", unit: "leadů/měsíc", targetDate: "2026-06-15" },
        { title: "Znalost značky v B2B segmentu", targetValue: "30", currentValue: "5", unit: "% (dotazník)", targetDate: "2026-06-15" },
      ],
      stakeholders: [
        { name: "Obchodní tým", role: StakeholderRole.REVIEWER, type: StakeholderType.INTERNAL },
        { name: "CEO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "Potenciální obchodní partneři", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL },
      ],
      risks: [
        { title: "Pozdní zadání - málo času na kvalitní zpracování", probability: "HIGH", impact: "MEDIUM", mitigation: "Brief template pro obchod. Minimální časový rámec pro zpracování.", owner: "Nelca" },
        { title: "Materiály nebudou odpovídat realitě z terénu", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Pravidelný sync marketing × obchod (1× měsíčně). Pilotní testování na reálných schůzkách.", owner: "Nelca" },
      ],
      notes: "Potřebné zdroje: Marketing (strategie, messaging), Obchod (zpětná vazba), grafický designér, copywriter, eventová produkce. Finance: grafika, tisk, eventy (produkce, pronájmy, catering, PR). Proces: kvalitní brief, sdílený plán.",
    },
    // ── 13. Nahradit Eurocross (Tržby) ─────────────────────────
    {
      title: "Nahradit Eurocross",
      problemStatement: "Postavit asistenční služby pro dlouhodobé pojištění cizinců v Uniqa.",
      successCriteria: "Během 2HOY2026 jsme v Uniqa a nově sjednané smlouvy obsluhujeme jako asistenční služba my. Tymio získá novou schopnost a budeme ji moci nabídnout i dalším pojišťovnám. Naučíme se dělat zdravotní asistenci v zahraničí.",
      description: "Nahrazení Eurocross jako poskytovatele asistenčních služeb pro Uniqa pojištění cizinců. Stavba modulárního systému: call centrum 24/7 (CZ/EN/VN/UA/RU), billing, data a analytika, nasmlouvání sítě zdravotních zařízení, online evidence případů.",
      product: "Integrační platforma", domain: "Tržby", owner: "Ondra",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-02-01", targetDate: "2026-12-31", milestoneDate: "2026-06-30",
      dateConfidence: DateConfidence.LOW, arrImpact: 500000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Pacient: 4, Lékař: 3, Zaměstnavatel: 1, Pojišťovna: 5, "B2B Admin": 3, Regulátor: 3 },
      revenueWeights: { B2B: 5, B2G2C: 5, B2C: 10, Pojištění: 75, B2B2C: 5 },
      raci: { accountable: "Ondra", implementer: "Sergei", consulted: ["Kuba", "Adela"], informed: ["Vasek"] },
      features: [
        { title: "Call centrum 24/7 multilanguage", description: "Vybudování call centra 24/7 v jazycích CZ/EN/VN/UA/RU. Zjistit co umí současný systém Daktela.", status: FeatureStatus.IDEA, startDate: "2026-04-01", targetDate: "2026-08-31", requirements: ["Nábor multilanguage operátorů (2x backup)", "Integrace Daktela", "Nahrávání hovorů", "SLA monitoring"] },
        { title: "Síť zdravotních zařízení", description: "Nasmlouvání sítě zdravotních zařízení pro cizince, ideálně s jazykovým vybavením.", status: FeatureStatus.IDEA, startDate: "2026-03-01", targetDate: "2026-07-31", requirements: ["Identifikace zařízení s jazykovým vybavením", "Smluvní zajištění", "Geolokační pokrytí"] },
        { title: "Online evidence případů", description: "Real-time evidence případů s přístupem pro Uniqa. Možné napojení na registr pojištěných cizinců.", status: FeatureStatus.IDEA, startDate: "2026-05-01", targetDate: "2026-09-30", requirements: ["Přístup k Uniqa databázi", "Real-time tracking případů", "Reporting dashboard"] },
        { title: "Multilanguage app", description: "Aplikace dostupná v EN/VN/UA/RU na AppStore a Google Play v zemích ex-SSSR a Vietnam.", status: FeatureStatus.IDEA, startDate: "2026-06-01", targetDate: "2026-10-31", requirements: ["i18n EN/VN/UA/RU", "Distribuce v cílových zemích", "Lokalizovaný onboarding"] },
      ],
      milestones: [
        { title: "Spočítat pricing služby", targetDate: "2026-02-28", status: MilestoneStatus.DONE, owner: "Ondra" },
        { title: "Zjistit co umí současný systém Daktela", targetDate: "2026-03-15", status: MilestoneStatus.TODO, owner: "Ondra" },
        { title: "Připravit procesní mapy a identifikovat timing", targetDate: "2026-03-31", status: MilestoneStatus.TODO, owner: "Ondra" },
        { title: "Jednat s ostatními pojišťovnami (Colonade, PVZP)", status: MilestoneStatus.TODO, owner: "Ondra" },
        { title: "Postavit tým", targetDate: "2026-06-30", status: MilestoneStatus.TODO, owner: "Ondra" },
      ],
      kpis: [
        { title: "Pojišťovny obsluhované jako asistenční služba", targetValue: "2", currentValue: "0", unit: "pojišťoven", targetDate: "2026-12-31" },
        { title: "Jazyky call centra", targetValue: "5", currentValue: "0", unit: "jazyků", targetDate: "2026-12-31" },
        { title: "Nasmlouvaná zdravotní zařízení", targetValue: "50", currentValue: "0", unit: "zařízení", targetDate: "2026-12-31" },
      ],
      stakeholders: [
        { name: "CEO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "COO", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.INTERNAL },
        { name: "Uniqa", role: StakeholderRole.DECISION_MAKER, type: StakeholderType.EXTERNAL, organization: "Uniqa pojišťovna" },
        { name: "ČNB (regulátor pojišťoven)", role: StakeholderRole.REVIEWER, type: StakeholderType.EXTERNAL, organization: "ČNB" },
        { name: "Colonade pojišťovna", role: StakeholderRole.SPONSOR, type: StakeholderType.EXTERNAL },
        { name: "PVZP", role: StakeholderRole.SPONSOR, type: StakeholderType.EXTERNAL },
      ],
      risks: [
        { title: "24/7 pokrytí a jazyky - na začátku dražší než vydělává", probability: "HIGH", impact: "HIGH", mitigation: "Ekonomiku přinese pouze obsluha více pojišťoven. Modulární systém (in-house vs outsource).", owner: "Ondra" },
        { title: "Nasmlouvání sítě zdravotních zařízení", probability: "MEDIUM", impact: "HIGH", mitigation: "Najít člověka s praxí na zasmluvnění. Oslovit existující sítě.", owner: "Ondra" },
        { title: "Kritéria regulátora pojišťoven - ČNB, SLA", probability: "MEDIUM", impact: "HIGH", mitigation: "Právní příprava od začátku. Compliance audit.", owner: "Kuba" },
      ],
      notes: "Modulární stavba jako Lego: Call Centrum = samostatná jednotka, billing = samostatná jednotka, Data a analytika = samostatná jednotka. Každou kostku nacenit. Peak ráno, pondělí/úterý, víkend slabý. Investice ~25k CZK/měsíc za telefonii. Cesta k cestovnímu pojištění - asistence.",
    },
  ];

  // ─── Seed initiatives ─────────────────────────────────────────
  const seededInitiatives: { id: string; title: string; featureIds: string[] }[] = [];

  for (const [index, def] of initDefs.entries()) {
    const initiative = await prisma.initiative.create({
      data: {
        productId: prod[def.product].id,
        title: def.title,
        description: def.description,
        problemStatement: def.problemStatement,
        successCriteria: def.successCriteria,
        domainId: dom[def.domain].id,
        ownerId: u[def.owner].id,
        priority: def.priority,
        horizon: def.horizon,
        status: def.status,
        commercialType: def.commercialType,
        isGap: def.isGap ?? false,
        isEpic: true,
        startDate: new Date(def.startDate),
        targetDate: new Date(def.targetDate),
        milestoneDate: new Date(def.milestoneDate),
        dateConfidence: def.dateConfidence,
        arrImpact: def.arrImpact,
        renewalDate: new Date(def.targetDate),
        dealStage: def.dealStage,
        strategicTier: def.strategicTier,
        notes: def.notes ?? null,
        sortOrder: index,
      },
    });

    await prisma.initiativePersonaImpact.createMany({
      data: Object.entries(def.impacts).map(([name, impact]) => ({
        initiativeId: initiative.id,
        personaId: per[name].id,
        impact,
      })),
    });

    await prisma.initiativeRevenueStream.createMany({
      data: Object.entries(def.revenueWeights).map(([name, weight]) => ({
        initiativeId: initiative.id,
        revenueStreamId: str[name].id,
        weight,
      })),
    });

    const rawAssignments = [
      { userId: u[def.raci.accountable].id, role: AssignmentRole.ACCOUNTABLE, allocation: 30 },
      { userId: u[def.raci.implementer].id, role: AssignmentRole.IMPLEMENTER, allocation: 50 },
      ...def.raci.consulted.map((n) => ({ userId: u[n].id, role: AssignmentRole.CONSULTED as AssignmentRole, allocation: null as number | null })),
      ...def.raci.informed.map((n) => ({ userId: u[n].id, role: AssignmentRole.INFORMED as AssignmentRole, allocation: null as number | null })),
    ];
    const seen = new Set<string>();
    const assignments = rawAssignments.filter((a) => {
      const key = `${a.userId}:${a.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await prisma.initiativeAssignment.createMany({
      data: assignments.map((a) => ({ initiativeId: initiative.id, ...a })),
    });

    const featureIds: string[] = [];
    for (const fDef of def.features) {
      const feature = await prisma.feature.create({
        data: {
          initiativeId: initiative.id,
          ownerId: u[def.owner].id,
          title: fDef.title,
          description: fDef.description,
          status: fDef.status,
          startDate: new Date(fDef.startDate),
          targetDate: new Date(fDef.targetDate),
          milestoneDate: new Date(fDef.startDate),
          dateConfidence: DateConfidence.MEDIUM,
        },
      });
      featureIds.push(feature.id);
      await prisma.requirement.createMany({
        data: fDef.requirements.map((title, i) => ({
          featureId: feature.id,
          title,
          isDone: fDef.status === FeatureStatus.DONE || (fDef.status === FeatureStatus.IN_PROGRESS && i === 0),
          priority: i === 0 ? Priority.P0 : i === 1 ? Priority.P1 : Priority.P2,
        })),
      });
    }

    for (const [mIdx, mDef] of def.milestones.entries()) {
      await prisma.initiativeMilestone.create({
        data: {
          initiativeId: initiative.id,
          title: mDef.title,
          status: mDef.status,
          targetDate: mDef.targetDate ? new Date(mDef.targetDate) : null,
          ownerId: mDef.owner ? u[mDef.owner].id : null,
          sequence: mIdx,
        },
      });
    }

    await prisma.initiativeKPI.createMany({
      data: def.kpis.map((k) => ({
        initiativeId: initiative.id,
        title: k.title,
        targetValue: k.targetValue ?? null,
        currentValue: k.currentValue ?? null,
        unit: k.unit ?? null,
        targetDate: k.targetDate ? new Date(k.targetDate) : null,
      })),
    });

    await prisma.stakeholder.createMany({
      data: def.stakeholders.map((s) => ({
        initiativeId: initiative.id,
        name: s.name,
        role: s.role,
        type: s.type,
        organization: s.organization ?? null,
      })),
    });

    for (const rDef of def.risks) {
      await prisma.risk.create({
        data: {
          title: rDef.title,
          probability: rDef.probability,
          impact: rDef.impact,
          mitigation: rDef.mitigation,
          ownerId: u[rDef.owner].id,
          initiativeId: initiative.id,
        },
      });
    }

    seededInitiatives.push({ id: initiative.id, title: initiative.title, featureIds });
  }

  // ─── Demandy ──────────────────────────────────────────────────
  const findInit = (title: string) => seededInitiatives.find((i) => i.title === title);

  const demands = await Promise.all([
    prisma.demand.create({
      data: { title: "Uniqa: nahrazení Eurocross asistenčními službami Tymio", description: "Uniqa požaduje plné převzetí asistenčních služeb pro pojištění cizinců od Eurocross.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.APPROVED, urgency: 5, accountId: acc["Uniqa pojištění cizinců"].id, ownerId: u.Ondra.id },
    }),
    prisma.demand.create({
      data: { title: "OZP: smlouva na internu a dermatologii", description: "Výběrové řízení na Magistrátu hl. m. Prahy pro smlouvu s OZP.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.VALIDATING, urgency: 5, accountId: acc["OZP (Oborová zdravotní pojišťovna)"].id, ownerId: u.Ondra.id },
    }),
    prisma.demand.create({
      data: { title: "UNION SK: smlouva na internu a dermatologii", description: "Přímá smlouva s UNION pojišťovnou na Slovensku bez výběrového řízení.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.VALIDATING, urgency: 4, accountId: acc["UNION pojišťovna SK"].id, ownerId: u.Ondra.id },
    }),
    prisma.demand.create({
      data: { title: "Broker Trust: zasmluvnění a spuštění distribuce", description: "Broker Trust požaduje dokumentaci, procesy a technické řešení pro zahájení distribuce Tymio přes makléře.", sourceType: DemandSourceType.PARTNER, status: DemandStatus.NEW, urgency: 4, partnerId: par["Broker Trust"].id, ownerId: u.Vasek.id },
    }),
    prisma.demand.create({
      data: { title: "B2G2C: pozitivní mediální obraz po Znojmu", description: "Nutnost vyžehlit mediální obraz po situaci ve Znojmě před dalším rozšířením do krajů.", sourceType: DemandSourceType.INTERNAL, status: DemandStatus.APPROVED, urgency: 5, ownerId: u.Adela.id },
    }),
    prisma.demand.create({
      data: { title: "PwC CZ+SK: reference a case study", description: "PwC požaduje dotažení spolupráce pro referenční case study v CZ i SK.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.APPROVED, urgency: 3, accountId: acc["PwC Česká republika"].id, ownerId: u.Vasek.id },
    }),
  ]);

  const demandLinks = [
    { demand: demands[0], init: findInit("Nahradit Eurocross") },
    { demand: demands[1], init: findInit("Úhrady z pojišťoven - interna a dermatologie (CZ + SK)") },
    { demand: demands[2], init: findInit("Úhrady z pojišťoven - interna a dermatologie (CZ + SK)") },
    { demand: demands[3], init: findInit("B2B2C (makléři, platby, pilot B2C, VIP balíček)") },
    { demand: demands[4], init: findInit("B2G2C (kraje)") },
    { demand: demands[5], init: findInit("20 firem (B2B obchod)") },
  ];
  for (const dl of demandLinks) {
    if (dl.init) {
      await prisma.demandLink.create({
        data: { demandId: dl.demand.id, initiativeId: dl.init.id, featureId: dl.init.featureIds[0] },
      });
    }
  }

  // ─── Závislosti ───────────────────────────────────────────────
  const depPairs = [
    { from: "Distribuce Tymio přes telekomunikační společnosti", to: "20 firem (B2B obchod)", desc: "Telco partneři se počítají do cíle 20 B2B klientů" },
    { from: "Skupina Rodina (Dětský profil)", to: "Webové rozhraní", desc: "Rodinné profily potřebují webové rozhraní pro desktopovou správu" },
    { from: "B2B2C (makléři, platby, pilot B2C, VIP balíček)", to: "Marketingová podpora obchodu", desc: "B2B2C distribuce vyžaduje hotové obchodní materiály" },
    { from: "Nahradit Eurocross", to: "Úhrady z pojišťoven - interna a dermatologie (CZ + SK)", desc: "Eurocross nahrazení závisí na funkčním vykazování pojišťovnám" },
    { from: "Za hranice obvyklého (push, očkování, bonusy)", to: "Checklist všech věcí / nastavení očekávání", desc: "Proaktivní notifikace vyžadují správně nastavená očekávání" },
    { from: "Medicínské guidelines", to: "Úhrady z pojišťoven - interna a dermatologie (CZ + SK)", desc: "Guidelines musí být kompatibilní se smlouvami pojišťoven" },
  ];
  for (const dep of depPairs) {
    const from = findInit(dep.from);
    const to = findInit(dep.to);
    if (from && to) {
      await prisma.dependency.create({ data: { fromInitiativeId: from.id, toInitiativeId: to.id, description: dep.desc } });
    }
  }

  // ─── Rozhodnutí ───────────────────────────────────────────────
  const uhradyInit = findInit("Úhrady z pojišťoven - interna a dermatologie (CZ + SK)");
  const eurocrossInit = findInit("Nahradit Eurocross");
  const b2b2cInit = findInit("B2B2C (makléři, platby, pilot B2C, VIP balíček)");

  await Promise.all([
    prisma.decision.create({ data: { title: "DASTA protokol pro vykazování vůči OZP", rationale: "OZP mandátuje DASTA v4 pro elektronické podávání nároků. Alternativní protokol není k dispozici.", impactedTeams: "Engineering, Finance, Medical", initiativeId: uhradyInit!.id, decidedAt: new Date("2026-03-04") } }),
    prisma.decision.create({ data: { title: "Modulární architektura pro Eurocross nahrazení", rationale: "Stavíme modulárně (Lego): call centrum, billing, data/analytika jako samostatné jednotky. Umožňuje in-house vs outsource flexibilitu.", impactedTeams: "Engineering, Operations, Finance", initiativeId: eurocrossInit!.id, decidedAt: new Date("2026-02-28") } }),
    prisma.decision.create({ data: { title: "Byznys model B2B2C distribuce přes makléře", rationale: "Potřeba vyjasněného modelu: B2B (jako Uniqa) nebo B2B2C (jako makléř). Rozhodnutí do konce Q1.", impactedTeams: "Sales, Product, Finance", initiativeId: b2b2cInit!.id, decidedAt: new Date("2026-03-01") } }),
  ]);

  // ─── Kampaně a assety ─────────────────────────────────────────
  const campaigns = await Promise.all([
    prisma.campaign.create({ data: { name: "Znojmo, buď zdravější", description: "Akce ve Znojmě 21/3 - příležitost ukázat se a posílit pozitivní PR po mediálních problémech.", type: CampaignType.EVENT, status: CampaignStatus.ACTIVE, startDate: new Date("2026-03-21"), endDate: new Date("2026-03-21"), budget: 15000, ownerId: u.Nelca.id } }),
    prisma.campaign.create({ data: { name: "PwC Dny zdraví", description: "Zdravotní dny pro zaměstnance PwC CZ i SK jako referenční case study.", type: CampaignType.PARTNER_COBRANDING, status: CampaignStatus.ACTIVE, startDate: new Date("2026-04-01"), endDate: new Date("2026-06-30"), budget: 20000, ownerId: u.Vasek.id } }),
    prisma.campaign.create({ data: { name: "B2B LinkedIn a PR kampaň", description: "Systematická LinkedIn a PR kampaň pro budování znalosti značky v B2B segmentu. Aspirace 3 témata měsíčně v médiích.", type: CampaignType.PRODUCT_LAUNCH, status: CampaignStatus.ACTIVE, startDate: new Date("2026-03-01"), endDate: new Date("2026-12-31"), budget: 48000, ownerId: u.Nelca.id } }),
    prisma.campaign.create({ data: { name: "UNIQA Dny pro obchodní partnery", description: "Eventy pro tým a obchodní partnery Uniqa, posílení vztahu.", type: CampaignType.EVENT, status: CampaignStatus.COMPLETED, startDate: new Date("2025-11-01"), endDate: new Date("2025-12-31"), budget: 10000, ownerId: u.Adela.id } }),
  ]);

  await Promise.all([
    prisma.asset.create({ data: { campaignId: campaigns[0].id, name: "Znojmo event landing page", type: AssetType.LANDING_PAGE, status: AssetStatus.PUBLISHED, url: "https://dd.health/znojmo" } }),
    prisma.asset.create({ data: { campaignId: campaigns[1].id, name: "PwC Dny zdraví prezentace", type: AssetType.PRESENTATION, status: AssetStatus.APPROVED, personaId: per.Zaměstnavatel.id } }),
    prisma.asset.create({ data: { campaignId: campaigns[1].id, name: "PwC case study leaflet", type: AssetType.LEAFLET, status: AssetStatus.IN_REVIEW, personaId: per["B2B Admin"].id } }),
    prisma.asset.create({ data: { campaignId: campaigns[2].id, name: "B2B obchodní prezentace (CZ/EN/SK)", type: AssetType.PRESENTATION, status: AssetStatus.PUBLISHED, personaId: per["B2B Admin"].id } }),
    prisma.asset.create({ data: { campaignId: campaigns[2].id, name: "LinkedIn content kalendář", type: AssetType.SOCIAL_POST, status: AssetStatus.PUBLISHED } }),
    prisma.asset.create({ data: { campaignId: campaigns[2].id, name: "B2B 1-pager", type: AssetType.LEAFLET, status: AssetStatus.IN_REVIEW, personaId: per.Zaměstnavatel.id } }),
  ]);

  await Promise.all([
    prisma.campaignLink.create({ data: { campaignId: campaigns[0].id, accountId: acc["Znojmo (město)"].id, initiativeId: findInit("B2G2C (kraje)")?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[1].id, accountId: acc["PwC Česká republika"].id, initiativeId: findInit("20 firem (B2B obchod)")?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[2].id, initiativeId: findInit("Marketingová podpora obchodu")?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[3].id, accountId: acc["Uniqa pojištění cizinců"].id, initiativeId: findInit("Nahradit Eurocross")?.id } }),
  ]);

  // ─── Notification rules: RACI over initiative ───────────────────
  await prisma.notificationRule.deleteMany({ where: { entityType: "INITIATIVE" } });
  const initiativeActions: AuditAction[] = [AuditAction.CREATED, AuditAction.UPDATED, AuditAction.STATUS_CHANGED, AuditAction.DELETED];
  const channels = ["IN_APP"] as const;
  const raciRules: { action: AuditAction; entityType: string; recipientKind: NotificationRecipientKind; recipientRole: string | null }[] = [
    ...initiativeActions.map((action) => ({ action, entityType: "INITIATIVE", recipientKind: NotificationRecipientKind.OBJECT_OWNER, recipientRole: null })),
    ...initiativeActions.map((action) => ({ action, entityType: "INITIATIVE", recipientKind: NotificationRecipientKind.OBJECT_ASSIGNEE, recipientRole: null })),
    ...initiativeActions.flatMap((action) =>
      ([AssignmentRole.ACCOUNTABLE, AssignmentRole.IMPLEMENTER, AssignmentRole.CONSULTED, AssignmentRole.INFORMED] as const).map((role) => ({
        action,
        entityType: "INITIATIVE",
        recipientKind: NotificationRecipientKind.OBJECT_ROLE,
        recipientRole: role
      }))
    )
  ];
  await prisma.notificationRule.createMany({
    data: raciRules.map((r) => ({
      action: r.action,
      entityType: r.entityType,
      eventKind: null,
      recipientKind: r.recipientKind,
      recipientRole: r.recipientRole,
      deliveryChannels: channels,
      enabled: true
    }))
  });

  console.log("Seed dokončen úspěšně!");
}

main()
  .then(async () => {
    await basePrisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await basePrisma.$disconnect();
    process.exit(1);
  });

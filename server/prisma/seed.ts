import {
  AssignmentRole,
  AccountType,
  AssetStatus,
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
  PersonaCategory,
  Priority,
  PrismaClient,
  StrategicTier,
  UserRole
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditEntry.deleteMany();
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

  // ─── Users ──────────────────────────────────────────────────────
  const teamDefs: { name: string; email: string; aliases?: string[]; role: UserRole }[] = [
    { name: "Sergei", email: "s@strt.vc", aliases: ["sarhej@gmail.com"], role: UserRole.SUPER_ADMIN },
    { name: "Ondra", email: "ondrej.svoboda@drdigital.care", aliases: ["svoboda@ehtmedic.cz"], role: UserRole.SUPER_ADMIN },
    { name: "Jilka", email: "jitka.projektak@gmail.com", role: UserRole.SUPER_ADMIN },
    { name: "Nelca", email: "nela.mataseje@drdigital.care", role: UserRole.ADMIN },
    { name: "Vasek", email: "vaclav.cerny@drdigital.care", role: UserRole.EDITOR },
    { name: "Kuba", email: "jakub.justra@drdigital.care", role: UserRole.ADMIN },
    { name: "Adela", email: "adela.hlouskova@drdigital.care", role: UserRole.EDITOR },
    { name: "Zdenek", email: "zdenek.trtil@drdigital.care", role: UserRole.MARKETING },
    { name: "Ales", email: "ales.zarsky@gmail.com", role: UserRole.VIEWER },
    { name: "Michael", email: "michael.mladek@drdigital.care", role: UserRole.EDITOR },
    { name: "David", email: "david.hrdina@drdigital.care", role: UserRole.ADMIN },
    { name: "Pavel", email: "pavel.kratky@drdigital.care", role: UserRole.MARKETING },
    { name: "Martina", email: "martina.nova@drdigital.care", role: UserRole.VIEWER },
  ];

  const users = await Promise.all(
    teamDefs.map((t) =>
      prisma.user.upsert({
        where: { email: t.email },
        create: { name: t.name, email: t.email, role: t.role, isActive: true },
        update: { role: t.role, isActive: true },
      })
    )
  );

  // Create UserEmail records (primary + aliases)
  for (let i = 0; i < teamDefs.length; i++) {
    const def = teamDefs[i];
    const user = users[i];
    await prisma.userEmail.create({ data: { email: def.email, userId: user.id, isPrimary: true } });
    for (const alias of def.aliases ?? []) {
      await prisma.userEmail.create({ data: { email: alias, userId: user.id, isPrimary: false } });
    }
  }

  const u = Object.fromEntries(users.map((x) => [x.name, x]));

  // ─── Products ───────────────────────────────────────────────────
  const products = await Promise.all(
    [
      { name: "Doctor Digital App", description: "Core patient and doctor mobile/web experiences", sortOrder: 1 },
      { name: "B2B Platform", description: "Employer, insurer and government account capabilities", sortOrder: 2 },
      { name: "Integrations Platform", description: "Partner APIs, eGov and insurance system integrations", sortOrder: 3 },
    ].map((p) => prisma.product.create({ data: p }))
  );
  const prod = Object.fromEntries(products.map((p) => [p.name, p]));

  // ─── Domains ────────────────────────────────────────────────────
  const domains = await Promise.all(
    [
      { name: "Klient", color: "#7c3aed", sortOrder: 1 },
      { name: "Trzby", color: "#2563eb", sortOrder: 2 },
      { name: "Nad Ramec", color: "#059669", sortOrder: 3 },
      { name: "B2B", color: "#0f766e", sortOrder: 4 },
      { name: "Compliance", color: "#dc2626", sortOrder: 5 },
      { name: "Platforma", color: "#d97706", sortOrder: 6 },
    ].map((d) => prisma.domain.create({ data: d }))
  );
  const dom = Object.fromEntries(domains.map((d) => [d.name, d]));

  // ─── Personas ───────────────────────────────────────────────────
  const personas = await Promise.all(
    [
      { name: "Patient", icon: "user", category: PersonaCategory.USER },
      { name: "Doctor", icon: "stethoscope", category: PersonaCategory.USER },
      { name: "Employer", icon: "building", category: PersonaCategory.BUYER },
      { name: "Insurer", icon: "shield", category: PersonaCategory.BUYER },
      { name: "B2B Admin", icon: "briefcase", category: PersonaCategory.BUYER },
      { name: "Regulator", icon: "scale", category: PersonaCategory.BUYER },
    ].map((p) => prisma.persona.create({ data: p }))
  );
  const per = Object.fromEntries(personas.map((p) => [p.name, p]));

  // ─── Revenue Streams ───────────────────────────────────────────
  const streams = await Promise.all(
    [
      { name: "B2B", color: "#0ea5e9" },
      { name: "B2G2C", color: "#8b5cf6" },
      { name: "B2C", color: "#f97316" },
      { name: "Insurance", color: "#10b981" },
    ].map((s) => prisma.revenueStream.create({ data: s }))
  );
  const str = Object.fromEntries(streams.map((s) => [s.name, s]));

  // ─── Accounts ───────────────────────────────────────────────────
  const accounts = await Promise.all(
    [
      { name: "Skoda Auto Employee Health", type: AccountType.B2B2C, segment: "Enterprise employer", ownerId: u.Vasek.id, arrImpact: 420000, renewalDate: new Date("2026-09-30"), dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_1 },
      { name: "Pilsen Region Care Program", type: AccountType.B2G2C, segment: "Regional public healthcare", ownerId: u.Ondra.id, arrImpact: 510000, renewalDate: new Date("2026-12-31"), dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1 },
      { name: "VZP Insurance Pilot", type: AccountType.INSURER, segment: "Insurance channel", ownerId: u.Adela.id, arrImpact: 250000, renewalDate: new Date("2026-08-15"), dealStage: DealStage.PILOT, strategicTier: StrategicTier.TIER_2 },
      { name: "CSOB Employee Benefit", type: AccountType.B2B2C, segment: "Financial services employer", ownerId: u.Kuba.id, arrImpact: 310000, renewalDate: new Date("2026-11-30"), dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1 },
      { name: "Prague 6 Municipality", type: AccountType.B2G2C, segment: "Urban public healthcare", ownerId: u.Ondra.id, arrImpact: 180000, renewalDate: new Date("2027-03-31"), dealStage: DealStage.PILOT, strategicTier: StrategicTier.TIER_2 },
    ].map((a) => prisma.account.create({ data: a }))
  );
  const acc = Object.fromEntries(accounts.map((a) => [a.name, a]));

  // ─── Partners ───────────────────────────────────────────────────
  const partners = await Promise.all(
    [
      { name: "Kardi AI", kind: "Cardiology AI triage", ownerId: u.Pavel.id },
      { name: "Infermedica", kind: "Symptom checker and triage", ownerId: u.Sergei.id },
      { name: "CometChat", kind: "Provider communication SDK", ownerId: u.Kuba.id },
      { name: "MedicalChain", kind: "Blockchain health records", ownerId: u.David.id },
    ].map((p) => prisma.partner.create({ data: p }))
  );
  const par = Object.fromEntries(partners.map((p) => [p.name, p]));

  // ─── Initiatives ────────────────────────────────────────────────
  // Each initiative has unique dates, persona impacts, revenue weights, RACI, features
  type InitDef = {
    title: string;
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
    impacts: Record<string, number>; // persona name -> 1-5
    revenueWeights: Record<string, number>; // stream name -> weight
    raci: { accountable: string; implementer: string; consulted: string[]; informed: string[] };
    features: { title: string; description: string; status: FeatureStatus; startDate: string; targetDate: string; requirements: string[] }[];
  };

  const initDefs: InitDef[] = [
    {
      title: "E-Recept + E-Zadanky integration",
      description: "Full integration with Czech national e-Prescription system (E-Recept) and electronic referrals (E-Zadanky). Critical P0 compliance gate with regulatory deadline Q2 2026.",
      product: "Integrations Platform", domain: "Compliance", owner: "Kuba",
      priority: Priority.P0, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.COMPLIANCE_GATE,
      startDate: "2026-03-01", targetDate: "2026-05-31", milestoneDate: "2026-04-15",
      dateConfidence: DateConfidence.HIGH, arrImpact: 90000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_1,
      impacts: { Patient: 4, Doctor: 5, Employer: 1, Insurer: 3, "B2B Admin": 1, Regulator: 5 },
      revenueWeights: { B2B: 15, B2G2C: 30, B2C: 10, Insurance: 45 },
      raci: { accountable: "Kuba", implementer: "Sergei", consulted: ["David", "Jilka"], informed: ["Vasek", "Nelca"] },
      features: [
        { title: "E-Recept API connector", description: "SOAP/REST adapter for SUKL E-Recept API v3. Handles prescription creation, verification and cancellation flows.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-05", targetDate: "2026-04-20", requirements: ["SUKL API certificate integration", "Prescription XML schema validation", "Error handling for network timeouts"] },
        { title: "E-Zadanky referral bridge", description: "Bridge service connecting DD patient referrals with the national E-Zadanky system for electronic specialist referrals.", status: FeatureStatus.PLANNED, startDate: "2026-04-01", targetDate: "2026-05-15", requirements: ["Referral data mapping to E-Zadanky format", "Bidirectional status sync"] },
        { title: "Doctor prescription dashboard", description: "In-app dashboard for doctors to manage, track and renew e-prescriptions.", status: FeatureStatus.IDEA, startDate: "2026-04-15", targetDate: "2026-05-25", requirements: ["Prescription history view", "Quick-renew functionality"] },
      ],
    },
    {
      title: "Czech eGovernment integration",
      description: "Connect Doctor Digital with Czech eGovernment identity and services (Datove schranky, eIdentita). Foundation for all compliance features.",
      product: "Integrations Platform", domain: "Compliance", owner: "Sergei",
      priority: Priority.P0, horizon: Horizon.NOW, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.COMPLIANCE_GATE,
      startDate: "2026-03-10", targetDate: "2026-06-15", milestoneDate: "2026-04-30",
      dateConfidence: DateConfidence.HIGH, arrImpact: 75000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_1,
      impacts: { Patient: 3, Doctor: 4, Employer: 2, Insurer: 4, "B2B Admin": 2, Regulator: 5 },
      revenueWeights: { B2B: 10, B2G2C: 40, B2C: 5, Insurance: 45 },
      raci: { accountable: "Sergei", implementer: "Jilka", consulted: ["Kuba", "David"], informed: ["Ondra"] },
      features: [
        { title: "eIdentita SSO adapter", description: "Single sign-on adapter for Czech national eIdentita system. Enables government-verified identity for patient and doctor accounts.", status: FeatureStatus.PLANNED, startDate: "2026-03-15", targetDate: "2026-05-01", requirements: ["SAML 2.0 integration with NIA", "Identity verification level mapping", "Fallback authentication flow"] },
        { title: "Datove schranky connector", description: "Official document exchange via Czech Data Mailboxes for regulatory submissions and notifications.", status: FeatureStatus.IDEA, startDate: "2026-05-01", targetDate: "2026-06-10", requirements: ["Document signing with qualified certificate", "Delivery confirmation tracking"] },
      ],
    },
    {
      title: "B2B client zone (employer/local government portal)",
      description: "Self-service portal for B2B clients (employers, municipalities) to manage employee/citizen health programs, view analytics, and configure services.",
      product: "B2B Platform", domain: "B2B", owner: "Ondra",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-05-01", targetDate: "2026-09-30", milestoneDate: "2026-07-15",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 185000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Patient: 2, Doctor: 1, Employer: 5, Insurer: 3, "B2B Admin": 5, Regulator: 1 },
      revenueWeights: { B2B: 55, B2G2C: 25, B2C: 5, Insurance: 15 },
      raci: { accountable: "Ondra", implementer: "Vasek", consulted: ["Adela", "Kuba"], informed: ["David", "Pavel"] },
      features: [
        { title: "Client dashboard with KPIs", description: "Real-time dashboard showing enrollment rates, program utilization, NPS scores and cost impact per employer/municipality.", status: FeatureStatus.PLANNED, startDate: "2026-05-15", targetDate: "2026-07-30", requirements: ["Configurable KPI widgets", "CSV/PDF export", "Date range filtering"] },
        { title: "Employee roster management", description: "Bulk upload and management of employee/citizen lists with invitation flows and program assignment.", status: FeatureStatus.IDEA, startDate: "2026-06-01", targetDate: "2026-08-15", requirements: ["CSV bulk import with validation", "Email invitation sequences", "Roster delta sync"] },
        { title: "White-label configuration", description: "Allow B2B clients to customize portal branding — logo, colors, welcome text, and email templates.", status: FeatureStatus.IDEA, startDate: "2026-07-01", targetDate: "2026-09-15", requirements: ["Brand asset upload", "Preview mode", "Email template editor"] },
      ],
    },
    {
      title: "Webove rozhrani (web app)",
      description: "Full-featured web application complementing the mobile app. Enables patients to manage health records, book appointments and chat with doctors from desktop.",
      product: "Doctor Digital App", domain: "Klient", owner: "Kuba",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-03-01", targetDate: "2026-06-30", milestoneDate: "2026-05-01",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 65000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Patient: 5, Doctor: 4, Employer: 2, Insurer: 1, "B2B Admin": 1, Regulator: 1 },
      revenueWeights: { B2B: 10, B2G2C: 15, B2C: 60, Insurance: 15 },
      raci: { accountable: "Kuba", implementer: "Jilka", consulted: ["Nelca", "Sergei"], informed: ["David"] },
      features: [
        { title: "Patient health timeline", description: "Chronological view of all health events — visits, prescriptions, lab results, vaccinations.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-10", targetDate: "2026-05-01", requirements: ["FHIR data normalization", "Infinite scroll with lazy loading", "Filter by event type"] },
        { title: "Appointment booking web UI", description: "Desktop-optimized appointment scheduling with calendar integration and doctor availability.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-15", targetDate: "2026-04-30", requirements: ["Calendar view with time slots", "Doctor search and filter", "Booking confirmation email"] },
        { title: "Secure messaging (web)", description: "End-to-end encrypted messaging between patients and doctors via CometChat integration.", status: FeatureStatus.PLANNED, startDate: "2026-04-15", targetDate: "2026-06-15", requirements: ["CometChat SDK integration", "File/image attachment support", "Read receipts"] },
      ],
    },
    {
      title: "Sdileni profilu a detsky profil",
      description: "Family sharing: parents can manage children's health profiles, share access with partners/grandparents, and switch between family member views.",
      product: "Doctor Digital App", domain: "Klient", owner: "Nelca",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-06-01", targetDate: "2026-10-15", milestoneDate: "2026-08-01",
      dateConfidence: DateConfidence.LOW, arrImpact: 45000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Patient: 5, Doctor: 3, Employer: 3, Insurer: 2, "B2B Admin": 1, Regulator: 2 },
      revenueWeights: { B2B: 20, B2G2C: 20, B2C: 50, Insurance: 10 },
      raci: { accountable: "Nelca", implementer: "Adela", consulted: ["Kuba", "Martina"], informed: ["Vasek"] },
      features: [
        { title: "Child profile creation wizard", description: "Step-by-step wizard for parents to create and configure a child's health profile with guardian permissions.", status: FeatureStatus.IDEA, startDate: "2026-06-15", targetDate: "2026-08-15", requirements: ["Age-appropriate UI", "Guardian consent flow", "Pediatrician auto-linking"] },
        { title: "Family sharing invitations", description: "Invite family members to view/manage shared profiles with granular permission controls.", status: FeatureStatus.IDEA, startDate: "2026-07-15", targetDate: "2026-09-30", requirements: ["Invitation via email/SMS", "Permission levels (view/edit/admin)", "Revocation flow"] },
      ],
    },
    {
      title: "Telco B2B partnership",
      description: "White-label health services for major Czech telcos (O2, T-Mobile, Vodafone). Embed DD services into telco employee benefit packages.",
      product: "B2B Platform", domain: "Trzby", owner: "Adela",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-05-15", targetDate: "2026-10-31", milestoneDate: "2026-08-01",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 280000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Patient: 3, Doctor: 2, Employer: 5, Insurer: 2, "B2B Admin": 4, Regulator: 1 },
      revenueWeights: { B2B: 65, B2G2C: 5, B2C: 20, Insurance: 10 },
      raci: { accountable: "Adela", implementer: "Vasek", consulted: ["Ondra", "Pavel"], informed: ["Kuba", "David"] },
      features: [
        { title: "Telco SSO integration", description: "Single sign-on via telco identity providers (OAuth 2.0) for seamless employee onboarding.", status: FeatureStatus.PLANNED, startDate: "2026-06-01", targetDate: "2026-08-15", requirements: ["O2 OAuth adapter", "T-Mobile SAML adapter", "User provisioning webhooks"] },
        { title: "Telco billing API", description: "Usage-based billing integration with telco billing systems for per-employee-per-month model.", status: FeatureStatus.IDEA, startDate: "2026-07-15", targetDate: "2026-10-15", requirements: ["Billing event webhook", "Usage report generation", "Reconciliation dashboard"] },
      ],
    },
    {
      title: "20 firem (scale to 20 B2B clients)",
      description: "Operational readiness to onboard and support 20 simultaneous B2B employer/government accounts. Includes onboarding automation, support tooling, and SLA monitoring.",
      product: "B2B Platform", domain: "Trzby", owner: "Ondra",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.UPSELL_DRIVER,
      startDate: "2026-07-01", targetDate: "2026-12-15", milestoneDate: "2026-09-30",
      dateConfidence: DateConfidence.LOW, arrImpact: 350000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_1,
      impacts: { Patient: 2, Doctor: 1, Employer: 4, Insurer: 3, "B2B Admin": 5, Regulator: 1 },
      revenueWeights: { B2B: 50, B2G2C: 25, B2C: 5, Insurance: 20 },
      raci: { accountable: "Ondra", implementer: "Adela", consulted: ["Kuba", "Vasek"], informed: ["David", "Nelca"] },
      features: [
        { title: "Automated client onboarding", description: "Self-service onboarding flow with contract upload, brand config, and data migration wizard.", status: FeatureStatus.IDEA, startDate: "2026-07-15", targetDate: "2026-10-01", requirements: ["Multi-tenant provisioning", "Onboarding checklist engine", "Welcome email automation"] },
        { title: "SLA monitoring dashboard", description: "Real-time SLA compliance tracking per client with alerting for breaches.", status: FeatureStatus.IDEA, startDate: "2026-09-01", targetDate: "2026-11-30", requirements: ["Uptime tracking per tenant", "Response time percentiles", "Alert webhook integration"] },
      ],
    },
    {
      title: "Uhrady z pojistoven (insurance payments)",
      description: "Integration with Czech insurance companies (VZP, CPZP, OZP) for direct claim submission and payment reconciliation. Critical for revenue model.",
      product: "B2B Platform", domain: "Trzby", owner: "Kuba",
      priority: Priority.P0, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-03-05", targetDate: "2026-06-30", milestoneDate: "2026-05-15",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 220000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_1,
      impacts: { Patient: 2, Doctor: 5, Employer: 1, Insurer: 5, "B2B Admin": 2, Regulator: 4 },
      revenueWeights: { B2B: 10, B2G2C: 10, B2C: 5, Insurance: 75 },
      raci: { accountable: "Kuba", implementer: "Vasek", consulted: ["Adela", "Sergei"], informed: ["David", "Ondra"] },
      features: [
        { title: "VZP claim submission API", description: "Automated claim submission to VZP (largest Czech insurer) via their DASTA protocol.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-10", targetDate: "2026-05-15", requirements: ["DASTA XML message builder", "Claim status polling", "Error reconciliation workflow"] },
        { title: "Payment reconciliation engine", description: "Match incoming insurance payments with submitted claims and flag discrepancies.", status: FeatureStatus.PLANNED, startDate: "2026-04-15", targetDate: "2026-06-15", requirements: ["Bank statement parser (CSV/MT940)", "Fuzzy claim matching algorithm", "Dispute escalation workflow"] },
        { title: "Multi-insurer adapter layer", description: "Abstraction layer for connecting additional insurers (CPZP, OZP, VOZP) with minimal per-insurer code.", status: FeatureStatus.IDEA, startDate: "2026-05-15", targetDate: "2026-06-25", requirements: ["Insurer config registry", "Protocol adapter pattern", "Integration test harness"] },
      ],
    },
    {
      title: "Pece az domu (home care services)",
      description: "Enable at-home healthcare services — nurse visits, physiotherapy, post-op care. Includes scheduling, routing, and visit documentation.",
      product: "Doctor Digital App", domain: "Nad Ramec", owner: "Martina",
      priority: Priority.P2, horizon: Horizon.LATER, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY,
      startDate: "2026-10-01", targetDate: "2027-02-28", milestoneDate: "2026-12-01",
      dateConfidence: DateConfidence.LOW, arrImpact: 95000,
      dealStage: DealStage.PILOT, strategicTier: StrategicTier.TIER_3,
      impacts: { Patient: 5, Doctor: 4, Employer: 1, Insurer: 3, "B2B Admin": 1, Regulator: 2 },
      revenueWeights: { B2B: 10, B2G2C: 30, B2C: 40, Insurance: 20 },
      raci: { accountable: "Martina", implementer: "Jilka", consulted: ["Nelca", "Kuba"], informed: ["David"] },
      features: [
        { title: "Home visit scheduling", description: "Patient-facing scheduling for home care visits with provider availability and travel time estimation.", status: FeatureStatus.IDEA, startDate: "2026-10-15", targetDate: "2027-01-15", requirements: ["Provider calendar integration", "Geo-routing for travel time", "Patient address management"] },
        { title: "Visit documentation (mobile)", description: "Mobile-first visit documentation for nurses with offline support, photo capture, and vital signs recording.", status: FeatureStatus.IDEA, startDate: "2026-11-15", targetDate: "2027-02-15", requirements: ["Offline-first data sync", "Photo/document capture", "Structured vital signs forms"] },
      ],
    },
    {
      title: "Medicinske guidelines engine",
      description: "Evidence-based clinical decision support system. Provides doctors with contextual medical guidelines, drug interaction checks, and treatment protocol suggestions.",
      product: "Doctor Digital App", domain: "Nad Ramec", owner: "David",
      priority: Priority.P2, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.COST_REDUCER,
      startDate: "2026-06-15", targetDate: "2026-11-30", milestoneDate: "2026-09-01",
      dateConfidence: DateConfidence.LOW, arrImpact: 55000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_3,
      impacts: { Patient: 3, Doctor: 5, Employer: 1, Insurer: 4, "B2B Admin": 1, Regulator: 4 },
      revenueWeights: { B2B: 5, B2G2C: 20, B2C: 25, Insurance: 50 },
      raci: { accountable: "David", implementer: "Sergei", consulted: ["Kuba", "Jilka"], informed: ["Nelca", "Martina"] },
      features: [
        { title: "Drug interaction checker", description: "Real-time drug interaction warnings when prescribing, powered by SUKL drug database.", status: FeatureStatus.IDEA, startDate: "2026-07-01", targetDate: "2026-09-30", requirements: ["SUKL drug DB integration", "Severity classification (minor/moderate/severe)", "Override with justification"] },
        { title: "Treatment protocol suggestions", description: "Context-aware treatment protocol suggestions based on diagnosis, patient history, and Czech medical guidelines.", status: FeatureStatus.IDEA, startDate: "2026-08-15", targetDate: "2026-11-15", requirements: ["Guidelines knowledge base import", "Patient context matching", "Confidence scoring"] },
      ],
    },
    {
      title: "LP pro obchod a klienty (landing pages for sales)",
      description: "Landing page builder and management system for B2B sales. Customizable per-client landing pages, A/B testing, and lead capture with CRM integration.",
      product: "B2B Platform", domain: "B2B", owner: "Nelca",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.IN_PROGRESS,
      commercialType: CommercialType.CONTRACT_ENABLER,
      startDate: "2026-03-15", targetDate: "2026-06-15", milestoneDate: "2026-05-01",
      dateConfidence: DateConfidence.HIGH, arrImpact: 120000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Patient: 1, Doctor: 1, Employer: 4, Insurer: 2, "B2B Admin": 5, Regulator: 1 },
      revenueWeights: { B2B: 50, B2G2C: 25, B2C: 15, Insurance: 10 },
      raci: { accountable: "Nelca", implementer: "Pavel", consulted: ["Adela", "Ondra"], informed: ["Kuba"] },
      features: [
        { title: "LP template engine", description: "Drag-and-drop landing page builder with pre-built templates for employer, municipality, and insurer audiences.", status: FeatureStatus.IN_PROGRESS, startDate: "2026-03-20", targetDate: "2026-05-15", requirements: ["Responsive template system", "Brand color/logo injection", "SEO metadata editor"] },
        { title: "Lead capture & analytics", description: "Form builder with lead scoring, UTM tracking, and conversion analytics dashboard.", status: FeatureStatus.PLANNED, startDate: "2026-04-15", targetDate: "2026-06-01", requirements: ["Form field configurator", "UTM parameter tracking", "Weekly conversion report emails"] },
      ],
    },
    {
      title: "MKTG podpora (events, PPT, affiliate program)",
      description: "Marketing operations toolkit — event management, presentation generator, and affiliate partner program with tracking and commission management.",
      product: "B2B Platform", domain: "B2B", owner: "Pavel",
      priority: Priority.P2, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.UPSELL_DRIVER,
      startDate: "2026-07-01", targetDate: "2026-11-15", milestoneDate: "2026-09-15",
      dateConfidence: DateConfidence.LOW, arrImpact: 70000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_3,
      impacts: { Patient: 1, Doctor: 1, Employer: 4, Insurer: 2, "B2B Admin": 4, Regulator: 1 },
      revenueWeights: { B2B: 45, B2G2C: 20, B2C: 25, Insurance: 10 },
      raci: { accountable: "Pavel", implementer: "Martina", consulted: ["Nelca", "Adela"], informed: ["Kuba", "David"] },
      features: [
        { title: "Event management module", description: "Create, promote, and track events (webinars, conferences, demos) with registration and attendance tracking.", status: FeatureStatus.IDEA, startDate: "2026-07-15", targetDate: "2026-09-30", requirements: ["Event creation wizard", "Registration form builder", "Post-event feedback survey"] },
        { title: "Affiliate tracking system", description: "Partner referral tracking with unique codes, conversion attribution, and commission calculation.", status: FeatureStatus.IDEA, startDate: "2026-09-01", targetDate: "2026-11-01", requirements: ["Unique referral code generation", "Conversion pixel/webhook", "Monthly commission reports"] },
      ],
    },
    {
      title: "Analytika (klient i partner B2B)",
      description: "Unified analytics platform for both patients (health insights) and B2B partners (business intelligence). Dashboards, reports, and data export.",
      product: "Doctor Digital App", domain: "Platforma", owner: "Pavel",
      priority: Priority.P1, horizon: Horizon.NOW, status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.COST_REDUCER, isGap: true,
      startDate: "2026-03-20", targetDate: "2026-07-31", milestoneDate: "2026-05-30",
      dateConfidence: DateConfidence.MEDIUM, arrImpact: 85000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Patient: 3, Doctor: 3, Employer: 4, Insurer: 4, "B2B Admin": 5, Regulator: 2 },
      revenueWeights: { B2B: 35, B2G2C: 20, B2C: 20, Insurance: 25 },
      raci: { accountable: "Pavel", implementer: "Sergei", consulted: ["Kuba", "Ondra"], informed: ["Adela", "Vasek"] },
      features: [
        { title: "Patient health insights", description: "Personalized health metrics dashboard for patients — activity trends, vital signs history, wellness score.", status: FeatureStatus.PLANNED, startDate: "2026-04-01", targetDate: "2026-06-15", requirements: ["Data aggregation pipeline", "Trend visualization charts", "Health score algorithm"] },
        { title: "B2B partner reporting", description: "Business intelligence dashboards for B2B clients showing program ROI, utilization, and population health metrics.", status: FeatureStatus.IDEA, startDate: "2026-05-15", targetDate: "2026-07-15", requirements: ["Multi-tenant data isolation", "Scheduled PDF report generation", "Data export API"] },
      ],
    },
    {
      title: "Mapovani klientskych cest (patient journey mapping)",
      description: "Map and optimize complete patient journeys — from symptom onset through triage, consultation, treatment, and follow-up. Identify drop-off points and improve conversion.",
      product: "Doctor Digital App", domain: "Klient", owner: "David",
      priority: Priority.P1, horizon: Horizon.NEXT, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY, isGap: true,
      startDate: "2026-06-01", targetDate: "2026-10-31", milestoneDate: "2026-08-15",
      dateConfidence: DateConfidence.LOW, arrImpact: 55000,
      dealStage: DealStage.ACTIVE, strategicTier: StrategicTier.TIER_2,
      impacts: { Patient: 5, Doctor: 3, Employer: 2, Insurer: 2, "B2B Admin": 2, Regulator: 1 },
      revenueWeights: { B2B: 15, B2G2C: 15, B2C: 55, Insurance: 15 },
      raci: { accountable: "David", implementer: "Adela", consulted: ["Nelca", "Jilka"], informed: ["Kuba", "Martina"] },
      features: [
        { title: "Journey analytics funnel", description: "Funnel visualization showing patient progression through care stages with drop-off analysis.", status: FeatureStatus.IDEA, startDate: "2026-06-15", targetDate: "2026-09-01", requirements: ["Event tracking pipeline", "Funnel visualization component", "Cohort comparison"] },
        { title: "Proactive nudge engine", description: "Automated patient nudges (push/SMS/email) triggered by journey stage timeouts or risk indicators.", status: FeatureStatus.IDEA, startDate: "2026-08-01", targetDate: "2026-10-15", requirements: ["Nudge rule configuration", "Multi-channel delivery", "A/B testing support"] },
      ],
    },
    {
      title: "Balicky produktu (freemium tiers)",
      description: "Product packaging and freemium model: Free basic tier, Premium (B2C), and Enterprise (B2B). Includes paywall, feature gating, and upgrade flows.",
      product: "B2B Platform", domain: "Trzby", owner: "Ondra",
      priority: Priority.P2, horizon: Horizon.LATER, status: InitiativeStatus.IDEA,
      commercialType: CommercialType.UPSELL_DRIVER, isGap: true,
      startDate: "2026-09-01", targetDate: "2027-01-31", milestoneDate: "2026-11-15",
      dateConfidence: DateConfidence.LOW, arrImpact: 160000,
      dealStage: DealStage.CONTRACTING, strategicTier: StrategicTier.TIER_2,
      impacts: { Patient: 4, Doctor: 2, Employer: 4, Insurer: 2, "B2B Admin": 3, Regulator: 1 },
      revenueWeights: { B2B: 30, B2G2C: 10, B2C: 50, Insurance: 10 },
      raci: { accountable: "Ondra", implementer: "Vasek", consulted: ["Kuba", "Adela"], informed: ["David", "Pavel"] },
      features: [
        { title: "Feature gating system", description: "Server-side feature flag system that enables/disables features based on subscription tier.", status: FeatureStatus.IDEA, startDate: "2026-09-15", targetDate: "2026-11-30", requirements: ["Feature flag configuration UI", "SDK for client/server evaluation", "Graceful degradation for gated features"] },
        { title: "Upgrade and payment flows", description: "In-app upgrade prompts, pricing page, and Stripe payment integration for B2C premium subscriptions.", status: FeatureStatus.IDEA, startDate: "2026-10-15", targetDate: "2027-01-15", requirements: ["Stripe subscription integration", "Pricing page A/B testing", "Invoice generation"] },
      ],
    },
  ];

  const seededInitiatives: { id: string; title: string; featureIds: string[] }[] = [];

  for (const [index, def] of initDefs.entries()) {
    const initiative = await prisma.initiative.create({
      data: {
        productId: prod[def.product].id,
        title: def.title,
        description: def.description,
        domainId: dom[def.domain].id,
        ownerId: u[def.owner].id,
        priority: def.priority,
        horizon: def.horizon,
        status: def.status,
        commercialType: def.commercialType,
        isGap: def.isGap ?? false,
        startDate: new Date(def.startDate),
        targetDate: new Date(def.targetDate),
        milestoneDate: new Date(def.milestoneDate),
        dateConfidence: def.dateConfidence,
        arrImpact: def.arrImpact,
        renewalDate: new Date(def.targetDate),
        dealStage: def.dealStage,
        strategicTier: def.strategicTier,
        sortOrder: index,
      },
    });

    // Persona impacts
    await prisma.initiativePersonaImpact.createMany({
      data: Object.entries(def.impacts).map(([name, impact]) => ({
        initiativeId: initiative.id,
        personaId: per[name].id,
        impact,
      })),
    });

    // Revenue weights
    await prisma.initiativeRevenueStream.createMany({
      data: Object.entries(def.revenueWeights).map(([name, weight]) => ({
        initiativeId: initiative.id,
        revenueStreamId: str[name].id,
        weight,
      })),
    });

    // RACI assignments
    const assignments = [
      { userId: u[def.raci.accountable].id, role: AssignmentRole.ACCOUNTABLE, allocation: 30 },
      { userId: u[def.raci.implementer].id, role: AssignmentRole.IMPLEMENTER, allocation: 50 },
      ...def.raci.consulted.map((n) => ({ userId: u[n].id, role: AssignmentRole.CONSULTED as AssignmentRole, allocation: null as number | null })),
      ...def.raci.informed.map((n) => ({ userId: u[n].id, role: AssignmentRole.INFORMED as AssignmentRole, allocation: null as number | null })),
    ];
    await prisma.initiativeAssignment.createMany({
      data: assignments.map((a) => ({ initiativeId: initiative.id, ...a })),
    });

    // Features + requirements
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

    seededInitiatives.push({ id: initiative.id, title: initiative.title, featureIds });
  }

  // ─── Demands ────────────────────────────────────────────────────
  const demands = await Promise.all([
    prisma.demand.create({
      data: { title: "White-label onboarding for Skoda employees", description: "Skoda HR requires branded onboarding flow with company logo, custom welcome messages, and employee verification via HR system API.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.APPROVED, urgency: 4, accountId: acc["Skoda Auto Employee Health"].id, ownerId: u.Vasek.id },
    }),
    prisma.demand.create({
      data: { title: "Municipality digital referral system", description: "Pilsen Region needs digital referral compatibility with their local healthcare routing system for citizen enrollment.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.VALIDATING, urgency: 5, accountId: acc["Pilsen Region Care Program"].id, ownerId: u.Ondra.id },
    }),
    prisma.demand.create({
      data: { title: "Kardi AI cardiac risk triage extension", description: "Extend symptom handoff flow with Kardi AI cardiac risk scoring before teleconsultation routing.", sourceType: DemandSourceType.PARTNER, status: DemandStatus.NEW, urgency: 3, partnerId: par["Kardi AI"].id, ownerId: u.Pavel.id },
    }),
    prisma.demand.create({
      data: { title: "Infermedica specialist recommendation pathway", description: "Expose recommendation_specialist pathway for teleconsultation routing based on Infermedica triage results.", sourceType: DemandSourceType.PARTNER, status: DemandStatus.PLANNED, urgency: 4, partnerId: par.Infermedica.id, ownerId: u.Sergei.id },
    }),
    prisma.demand.create({
      data: { title: "CSOB employee wellness dashboard", description: "CSOB wants aggregated wellness metrics dashboard for HR team showing program adoption and health improvement trends.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.NEW, urgency: 3, accountId: acc["CSOB Employee Benefit"].id, ownerId: u.Kuba.id },
    }),
    prisma.demand.create({
      data: { title: "VZP real-time claim status API", description: "VZP wants real-time claim status updates pushed to their system instead of polling-based reconciliation.", sourceType: DemandSourceType.ACCOUNT, status: DemandStatus.VALIDATING, urgency: 5, accountId: acc["VZP Insurance Pilot"].id, ownerId: u.Adela.id },
    }),
  ]);

  // Demand links
  const findInit = (title: string) => seededInitiatives.find((i) => i.title === title);
  const demandLinks = [
    { demand: demands[0], init: findInit("B2B client zone (employer/local government portal)") },
    { demand: demands[1], init: findInit("E-Recept + E-Zadanky integration") },
    { demand: demands[2], init: findInit("Medicinske guidelines engine") },
    { demand: demands[3], init: findInit("Webove rozhrani (web app)") },
    { demand: demands[4], init: findInit("Analytika (klient i partner B2B)") },
    { demand: demands[5], init: findInit("Uhrady z pojistoven (insurance payments)") },
  ];
  for (const dl of demandLinks) {
    if (dl.init) {
      await prisma.demandLink.create({
        data: { demandId: dl.demand.id, initiativeId: dl.init.id, featureId: dl.init.featureIds[0] },
      });
    }
  }

  // ─── Dependencies ───────────────────────────────────────────────
  const depPairs = [
    { from: "E-Recept + E-Zadanky integration", to: "Czech eGovernment integration", desc: "E-Recept depends on eGov identity and API layer" },
    { from: "B2B client zone (employer/local government portal)", to: "Analytika (klient i partner B2B)", desc: "B2B portal needs analytics engine for dashboards" },
    { from: "LP pro obchod a klienty (landing pages for sales)", to: "B2B client zone (employer/local government portal)", desc: "Landing pages drive leads into client zone" },
    { from: "Uhrady z pojistoven (insurance payments)", to: "E-Recept + E-Zadanky integration", desc: "Insurance billing requires prescription data" },
    { from: "Telco B2B partnership", to: "20 firem (scale to 20 B2B clients)", desc: "Telco partners count toward B2B scaling target" },
    { from: "Sdileni profilu a detsky profil", to: "Webove rozhrani (web app)", desc: "Family profiles need web interface for desktop management" },
    { from: "Medicinske guidelines engine", to: "E-Recept + E-Zadanky integration", desc: "Guidelines engine uses prescription data for drug interaction checks" },
  ];
  for (const dep of depPairs) {
    const from = findInit(dep.from);
    const to = findInit(dep.to);
    if (from && to) {
      await prisma.dependency.create({ data: { fromInitiativeId: from.id, toInitiativeId: to.id, description: dep.desc } });
    }
  }

  // ─── Decisions ──────────────────────────────────────────────────
  const eReceptInit = findInit("E-Recept + E-Zadanky integration");
  const b2bZoneInit = findInit("B2B client zone (employer/local government portal)");
  const uhradyInit = findInit("Uhrady z pojistoven (insurance payments)");
  const webInit = findInit("Webove rozhrani (web app)");

  await Promise.all([
    prisma.decision.create({ data: { title: "Use SOAP over REST for SUKL API", rationale: "SUKL E-Recept API only supports SOAP. REST wrapper adds unnecessary complexity.", impactedTeams: "Engineering, Compliance", initiativeId: eReceptInit!.id, decidedAt: new Date("2026-03-05") } }),
    prisma.decision.create({ data: { title: "Multi-tenant architecture for B2B zone", rationale: "Shared infra with logical tenant isolation (row-level security) preferred over per-tenant DBs for cost and ops simplicity.", impactedTeams: "Engineering, DevOps", initiativeId: b2bZoneInit!.id, decidedAt: new Date("2026-04-10") } }),
    prisma.decision.create({ data: { title: "DASTA protocol for VZP integration", rationale: "VZP mandates DASTA v4 for electronic claim submission. No alternative protocol available.", impactedTeams: "Engineering, Finance", initiativeId: uhradyInit!.id, decidedAt: new Date("2026-03-08") } }),
  ]);

  // ─── Risks ──────────────────────────────────────────────────────
  await Promise.all([
    prisma.risk.create({ data: { title: "SUKL API downtime during integration testing", probability: "MEDIUM", impact: "HIGH", mitigation: "Set up mock SUKL server for dev/staging. Negotiate dedicated test window with SUKL.", ownerId: u.Sergei.id, initiativeId: eReceptInit!.id } }),
    prisma.risk.create({ data: { title: "eIdentita certification delays", probability: "HIGH", impact: "HIGH", mitigation: "Start NIA certification process immediately. Have fallback email-based verification.", ownerId: u.Jilka.id, initiativeId: findInit("Czech eGovernment integration")!.id } }),
    prisma.risk.create({ data: { title: "Telco contract negotiation timeline slip", probability: "MEDIUM", impact: "MEDIUM", mitigation: "Start technical integration in parallel with legal. Use standard terms template.", ownerId: u.Adela.id, initiativeId: findInit("Telco B2B partnership")!.id } }),
    prisma.risk.create({ data: { title: "Web app performance with large health histories", probability: "LOW", impact: "HIGH", mitigation: "Implement virtual scrolling and pagination from day 1. Set up performance testing with synthetic data.", ownerId: u.Jilka.id, initiativeId: webInit!.id } }),
  ]);

  // ─── Campaigns & Assets ─────────────────────────────────────────
  const campaigns = await Promise.all([
    prisma.campaign.create({ data: { name: "Skoda Employee Wellness Launch", description: "Co-branded launch campaign with Skoda Auto for employee health onboarding. Target: 2,000 employees in first wave.", type: CampaignType.PARTNER_COBRANDING, status: CampaignStatus.ACTIVE, startDate: new Date("2026-04-01"), endDate: new Date("2026-06-30"), budget: 25000, ownerId: u.Nelca.id } }),
    prisma.campaign.create({ data: { name: "Pilsen Region Digital Health Webinar", description: "Educational webinar series for Pilsen region municipality stakeholders and healthcare professionals.", type: CampaignType.WEBINAR, status: CampaignStatus.DRAFT, startDate: new Date("2026-05-15"), endDate: new Date("2026-05-15"), budget: 5000, ownerId: u.Ondra.id } }),
    prisma.campaign.create({ data: { name: "Kardi AI Partnership Announcement", description: "Product launch campaign for the Kardi AI cardiology triage integration. Press release + demo event.", type: CampaignType.PRODUCT_LAUNCH, status: CampaignStatus.DRAFT, startDate: new Date("2026-06-01"), endDate: new Date("2026-07-31"), budget: 15000, ownerId: u.Pavel.id } }),
    prisma.campaign.create({ data: { name: "Summer Employer Referral Program", description: "Referral campaign targeting HR departments at mid-size employers. €50 reward per successful referral.", type: CampaignType.REFERRAL, status: CampaignStatus.DRAFT, startDate: new Date("2026-07-01"), endDate: new Date("2026-08-31"), budget: 10000, ownerId: u.Adela.id } }),
    prisma.campaign.create({ data: { name: "VZP Insurance Pilot Demo", description: "Demo event for VZP insurance pilot expansion stakeholders. Showcase claim automation and provider dashboard.", type: CampaignType.EVENT, status: CampaignStatus.ACTIVE, startDate: new Date("2026-04-15"), endDate: new Date("2026-04-15"), budget: 8000, ownerId: u.Adela.id } }),
  ]);

  await Promise.all([
    prisma.asset.create({ data: { campaignId: campaigns[0].id, name: "Skoda Employee Landing Page", description: "Co-branded LP for Skoda employees to register for Doctor Digital health program.", type: AssetType.LANDING_PAGE, status: AssetStatus.PUBLISHED, url: "https://dd.health/skoda-wellness", personaId: per.Patient.id, accountId: acc["Skoda Auto Employee Health"].id } }),
    prisma.asset.create({ data: { campaignId: campaigns[0].id, name: "Skoda Wellness Leaflet", description: "Printed A5 leaflet for HR distribution during onboarding sessions.", type: AssetType.LEAFLET, status: AssetStatus.APPROVED, personaId: per.Employer.id } }),
    prisma.asset.create({ data: { campaignId: campaigns[0].id, name: "Skoda Onboarding Email Sequence", description: "3-email drip: welcome, app download, first appointment booking.", type: AssetType.EMAIL_TEMPLATE, status: AssetStatus.IN_REVIEW, personaId: per.Patient.id } }),
    prisma.asset.create({ data: { campaignId: campaigns[1].id, name: "Pilsen Webinar Registration Page", type: AssetType.LANDING_PAGE, status: AssetStatus.DRAFT, url: "https://dd.health/pilsen-webinar", personaId: per["B2B Admin"].id } }),
    prisma.asset.create({ data: { campaignId: campaigns[1].id, name: "Pilsen Webinar Presentation", type: AssetType.PRESENTATION, status: AssetStatus.DRAFT, personaId: per.Doctor.id } }),
    prisma.asset.create({ data: { campaignId: campaigns[2].id, name: "Kardi AI Integration Banner", type: AssetType.BANNER, status: AssetStatus.DRAFT } }),
    prisma.asset.create({ data: { campaignId: campaigns[2].id, name: "Kardi AI Partner Landing Page", type: AssetType.LANDING_PAGE, status: AssetStatus.DRAFT, url: "https://dd.health/kardi-ai" } }),
    prisma.asset.create({ data: { campaignId: campaigns[3].id, name: "Employer Referral Social Post", type: AssetType.SOCIAL_POST, status: AssetStatus.DRAFT, personaId: per.Employer.id } }),
    prisma.asset.create({ data: { campaignId: campaigns[4].id, name: "VZP Pilot Demo Video", type: AssetType.VIDEO, status: AssetStatus.PUBLISHED, url: "https://dd.health/vzp-demo", personaId: per["B2B Admin"].id } }),
    prisma.asset.create({ data: { campaignId: campaigns[4].id, name: "VZP Event Leaflet", type: AssetType.LEAFLET, status: AssetStatus.APPROVED } }),
  ]);

  // Campaign links
  await Promise.all([
    prisma.campaignLink.create({ data: { campaignId: campaigns[0].id, accountId: acc["Skoda Auto Employee Health"].id, initiativeId: b2bZoneInit?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[1].id, accountId: acc["Pilsen Region Care Program"].id, initiativeId: eReceptInit?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[2].id, partnerId: par["Kardi AI"].id, initiativeId: findInit("Medicinske guidelines engine")?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[3].id, initiativeId: findInit("MKTG podpora (events, PPT, affiliate program)")?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[4].id, accountId: acc["VZP Insurance Pilot"].id, initiativeId: findInit("LP pro obchod a klienty (landing pages for sales)")?.id } }),
  ]);

  console.log("Seed completed successfully!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

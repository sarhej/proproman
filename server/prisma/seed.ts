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
  Priority,
  PrismaClient,
  StrategicTier,
  UserRole
} from "@prisma/client";

const prisma = new PrismaClient();

type SeedInitiative = {
  title: string;
  domain: string;
  owner?: string;
  priority: Priority;
  horizon: Horizon;
  status: InitiativeStatus;
  commercialType: CommercialType;
  isGap?: boolean;
  notes?: string;
};

async function main() {
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

  const teamNames = [
    "David",
    "Kuba",
    "Nelca",
    "Vasek",
    "Adela",
    "Ondra",
    "Jilka",
    "Sergei",
    "Pavel",
    "Martina",
    "Nela",
    "Juraj",
    "Jakub"
  ];

  const users = await Promise.all(
    teamNames.map((name, idx) =>
      prisma.user.upsert({
        where: { email: `${name.toLowerCase()}@doctordigital.local` },
        create: {
          name,
          email: `${name.toLowerCase()}@doctordigital.local`,
          role: idx < 6 ? UserRole.ADMIN : UserRole.VIEWER
        },
        update: {
          role: idx < 6 ? UserRole.ADMIN : UserRole.VIEWER
        }
      })
    )
  );

  const userByName = new Map(users.map((u) => [u.name, u]));

  const products = await Promise.all(
    [
      { name: "Doctor Digital App", description: "Core patient and doctor experiences", sortOrder: 1 },
      { name: "B2B Platform", description: "Employer and insurer account capabilities", sortOrder: 2 },
      { name: "Integrations Platform", description: "Partner and API integration capabilities", sortOrder: 3 }
    ].map((p) => prisma.product.create({ data: p }))
  );
  const productByName = new Map(products.map((p) => [p.name, p]));

  const domains = await Promise.all(
    [
      { name: "Klient", color: "#7c3aed", sortOrder: 1 },
      { name: "Trzby", color: "#2563eb", sortOrder: 2 },
      { name: "Nad Ramec", color: "#059669", sortOrder: 3 },
      { name: "B2B", color: "#0f766e", sortOrder: 4 },
      { name: "Compliance", color: "#dc2626", sortOrder: 5 },
      { name: "Platforma", color: "#d97706", sortOrder: 6 }
    ].map((d) =>
      prisma.domain.create({
        data: d
      })
    )
  );
  const domainByName = new Map(domains.map((d) => [d.name, d]));

  const personas = await Promise.all(
    [
      { name: "Patient", icon: "user" },
      { name: "Doctor", icon: "stethoscope" },
      { name: "Employer", icon: "building" },
      { name: "Insurer", icon: "shield" },
      { name: "B2B Admin", icon: "briefcase" },
      { name: "Regulator", icon: "scale" }
    ].map((p) =>
      prisma.persona.create({
        data: p
      })
    )
  );

  const personaByName = new Map(personas.map((p) => [p.name, p]));

  const revenueStreams = await Promise.all(
    [
      { name: "B2B", color: "#0ea5e9" },
      { name: "B2G2C", color: "#8b5cf6" },
      { name: "B2C", color: "#f97316" },
      { name: "Insurance", color: "#10b981" }
    ].map((s) =>
      prisma.revenueStream.create({
        data: s
      })
    )
  );
  const streamByName = new Map(revenueStreams.map((s) => [s.name, s]));

  const accounts = await Promise.all(
    [
      {
        name: "Skoda Auto Employee Health",
        type: AccountType.B2B2C,
        segment: "Enterprise employer",
        ownerId: userByName.get("Vasek")?.id,
        arrImpact: 420000,
        renewalDate: new Date("2026-09-30"),
        dealStage: DealStage.ACTIVE,
        strategicTier: StrategicTier.TIER_1
      },
      {
        name: "Pilsen Region Care Program",
        type: AccountType.B2G2C,
        segment: "Regional public healthcare",
        ownerId: userByName.get("Ondra")?.id,
        arrImpact: 510000,
        renewalDate: new Date("2026-12-31"),
        dealStage: DealStage.CONTRACTING,
        strategicTier: StrategicTier.TIER_1
      },
      {
        name: "VZP Insurance Pilot",
        type: AccountType.INSURER,
        segment: "Insurance channel",
        ownerId: userByName.get("Adela")?.id,
        arrImpact: 250000,
        renewalDate: new Date("2026-08-15"),
        dealStage: DealStage.PILOT,
        strategicTier: StrategicTier.TIER_2
      }
    ].map((a) => prisma.account.create({ data: a }))
  );
  const accountByName = new Map(accounts.map((a) => [a.name, a]));

  const partners = await Promise.all(
    [
      { name: "Kardi AI", kind: "Cardiology AI triage", ownerId: userByName.get("Pavel")?.id },
      { name: "Infermedica", kind: "Symptom checker and triage", ownerId: userByName.get("Sergei")?.id },
      { name: "CometChat", kind: "Provider communication SDK", ownerId: userByName.get("Kuba")?.id }
    ].map((p) => prisma.partner.create({ data: p }))
  );
  const partnerByName = new Map(partners.map((p) => [p.name, p]));

  const initiatives: SeedInitiative[] = [
    {
      title: "E-Recept + E-Zadanky integration",
      domain: "Compliance",
      priority: Priority.P0,
      horizon: Horizon.NOW,
      status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.COMPLIANCE_GATE,
      notes: "CIO P0 near-term stream, includes Czech eGovernment dependency."
    },
    {
      title: "Czech eGovernment integration",
      domain: "Compliance",
      priority: Priority.P0,
      horizon: Horizon.NOW,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.COMPLIANCE_GATE
    },
    {
      title: "B2B client zone (employer/local government portal)",
      domain: "B2B",
      priority: Priority.P1,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.PLANNED,
      commercialType: CommercialType.CONTRACT_ENABLER
    },
    {
      title: "Webove rozhrani",
      domain: "Klient",
      owner: "Kuba",
      priority: Priority.P1,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY
    },
    {
      title: "Sdileni profilu a detsky profil",
      domain: "Klient",
      owner: "Nelca",
      priority: Priority.P1,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY
    },
    {
      title: "Telco B2B",
      domain: "Trzby",
      owner: "Adela",
      priority: Priority.P1,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CONTRACT_ENABLER
    },
    {
      title: "20 firem",
      domain: "Trzby",
      owner: "Ondra",
      priority: Priority.P1,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.UPSELL_DRIVER
    },
    {
      title: "Uhrady z pojistoven",
      domain: "Trzby",
      priority: Priority.P0,
      horizon: Horizon.NOW,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CONTRACT_ENABLER
    },
    {
      title: "Pece az domu",
      domain: "Nad Ramec",
      owner: "Martina",
      priority: Priority.P2,
      horizon: Horizon.LATER,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY
    },
    {
      title: "Medicinske guidelines",
      domain: "Nad Ramec",
      owner: "Kuba",
      priority: Priority.P2,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.COST_REDUCER
    },
    {
      title: "LP pro obchod a klienty",
      domain: "B2B",
      owner: "Nelca",
      priority: Priority.P1,
      horizon: Horizon.NOW,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CONTRACT_ENABLER
    },
    {
      title: "MKTG podpora (eventy, PPT), affiliate",
      domain: "B2B",
      owner: "Nelca",
      priority: Priority.P2,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.UPSELL_DRIVER
    },
    {
      title: "Analytika (klient i partner B2B)",
      domain: "Platforma",
      owner: "Pavel",
      priority: Priority.P1,
      horizon: Horizon.NOW,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.COST_REDUCER,
      isGap: true
    },
    {
      title: "Mapovani klientskych cest",
      domain: "Klient",
      owner: "David",
      priority: Priority.P1,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.CARE_QUALITY,
      isGap: true
    },
    {
      title: "Balicky produktu (freemium)",
      domain: "Trzby",
      owner: "Ondra",
      priority: Priority.P2,
      horizon: Horizon.NEXT,
      status: InitiativeStatus.IDEA,
      commercialType: CommercialType.UPSELL_DRIVER,
      isGap: true
    }
  ];

  for (const [index, item] of initiatives.entries()) {
    const initiative = await prisma.initiative.create({
      data: {
        productId:
          item.domain === "B2B" || item.domain === "Trzby"
            ? productByName.get("B2B Platform")?.id
            : item.domain === "Compliance"
              ? productByName.get("Integrations Platform")?.id
              : productByName.get("Doctor Digital App")?.id,
        title: item.title,
        description: item.notes ?? null,
        domainId: domainByName.get(item.domain)!.id,
        ownerId: item.owner ? userByName.get(item.owner)?.id : null,
        priority: item.priority,
        horizon: item.horizon,
        status: item.status,
        commercialType: item.commercialType,
        isGap: item.isGap ?? false,
        startDate:
          item.horizon === Horizon.NOW
            ? new Date("2026-03-15")
            : item.horizon === Horizon.NEXT
              ? new Date("2026-06-01")
              : new Date("2026-10-01"),
        targetDate:
          item.horizon === Horizon.NOW
            ? new Date("2026-05-31")
            : item.horizon === Horizon.NEXT
              ? new Date("2026-09-30")
              : new Date("2027-01-31"),
        milestoneDate:
          item.horizon === Horizon.NOW
            ? new Date("2026-04-20")
            : item.horizon === Horizon.NEXT
              ? new Date("2026-07-20")
              : new Date("2026-11-20"),
        dateConfidence: item.horizon === Horizon.NOW ? DateConfidence.HIGH : DateConfidence.MEDIUM,
        arrImpact:
          item.domain === "Trzby" || item.domain === "B2B"
            ? 120000
            : item.domain === "Compliance"
              ? 90000
              : 45000,
        renewalDate:
          item.domain === "B2B" || item.domain === "Trzby" ? new Date("2026-09-30") : new Date("2026-12-31"),
        dealStage: item.domain === "Trzby" ? DealStage.CONTRACTING : DealStage.ACTIVE,
        strategicTier:
          item.priority === Priority.P0
            ? StrategicTier.TIER_1
            : item.priority === Priority.P1
              ? StrategicTier.TIER_2
              : StrategicTier.TIER_3,
        sortOrder: index
      }
    });

    const patient = personaByName.get("Patient")!;
    const doctor = personaByName.get("Doctor")!;
    const employer = personaByName.get("Employer")!;
    const insurer = personaByName.get("Insurer")!;
    const b2bAdmin = personaByName.get("B2B Admin")!;
    const regulator = personaByName.get("Regulator")!;

    let defaultImpacts = [
      { personaId: patient.id, impact: 3 },
      { personaId: doctor.id, impact: 3 },
      { personaId: employer.id, impact: 3 },
      { personaId: insurer.id, impact: 3 },
      { personaId: b2bAdmin.id, impact: 3 },
      { personaId: regulator.id, impact: 3 }
    ];

    if (item.title.includes("E-Recept")) {
      defaultImpacts = [
        { personaId: patient.id, impact: 4 },
        { personaId: doctor.id, impact: 5 },
        { personaId: employer.id, impact: 2 },
        { personaId: insurer.id, impact: 3 },
        { personaId: b2bAdmin.id, impact: 2 },
        { personaId: regulator.id, impact: 5 }
      ];
    }

    await prisma.initiativePersonaImpact.createMany({
      data: defaultImpacts.map((impact) => ({
        initiativeId: initiative.id,
        personaId: impact.personaId,
        impact: impact.impact
      }))
    });

    const streamRows =
      item.domain === "Trzby"
        ? [
            { stream: "B2B", weight: 45 },
            { stream: "B2G2C", weight: 25 },
            { stream: "Insurance", weight: 20 },
            { stream: "B2C", weight: 10 }
          ]
        : [
            { stream: "B2B", weight: 25 },
            { stream: "B2G2C", weight: 25 },
            { stream: "Insurance", weight: 25 },
            { stream: "B2C", weight: 25 }
          ];

    await prisma.initiativeRevenueStream.createMany({
      data: streamRows.map((row) => ({
        initiativeId: initiative.id,
        revenueStreamId: streamByName.get(row.stream)!.id,
        weight: row.weight
      }))
    });

    await prisma.initiativeAssignment.createMany({
      data: [
        {
          initiativeId: initiative.id,
          userId: (item.owner ? userByName.get(item.owner) : userByName.get("Kuba"))!.id,
          role: AssignmentRole.ACCOUNTABLE,
          allocation: 30
        },
        {
          initiativeId: initiative.id,
          userId: userByName.get("Pavel")!.id,
          role: AssignmentRole.IMPLEMENTER,
          allocation: 40
        },
        {
          initiativeId: initiative.id,
          userId: userByName.get("Nelca")!.id,
          role: AssignmentRole.CONSULTED
        },
        {
          initiativeId: initiative.id,
          userId: userByName.get("Vasek")!.id,
          role: AssignmentRole.INFORMED
        }
      ]
    });

    const feature = await prisma.feature.create({
      data: {
        initiativeId: initiative.id,
        ownerId: item.owner ? userByName.get(item.owner)?.id : userByName.get("Kuba")?.id,
        title: `${item.title} - MVP feature`,
        description: "Primary implementation feature for initiative execution.",
        status:
          item.status === InitiativeStatus.DONE
            ? FeatureStatus.DONE
            : item.status === InitiativeStatus.IN_PROGRESS
              ? FeatureStatus.IN_PROGRESS
              : FeatureStatus.PLANNED,
        startDate: new Date("2026-03-20"),
        targetDate: new Date("2026-05-20"),
        milestoneDate: new Date("2026-04-20"),
        dateConfidence: DateConfidence.MEDIUM
      }
    });

    await prisma.requirement.createMany({
      data: [
        {
          featureId: feature.id,
          title: "Requirement: functional acceptance criteria defined",
          description: "Feature has explicit expected behavior and acceptance rules.",
          priority: item.priority
        },
        {
          featureId: feature.id,
          title: "Requirement: analytics and audit coverage",
          description: "Track usage and major state transitions for reporting.",
          priority: Priority.P2
        }
      ]
    });
  }

  const demands = await Promise.all(
    [
      {
        title: "Employer asks for white-label onboarding",
        description: "B2B2C customer wants branded onboarding and reporting for employees.",
        sourceType: DemandSourceType.ACCOUNT,
        status: DemandStatus.APPROVED,
        urgency: 4,
        accountId: accountByName.get("Skoda Auto Employee Health")?.id,
        ownerId: userByName.get("Vasek")?.id
      },
      {
        title: "B2G2C requests municipality referral integration",
        description: "Region program requires digital referral compatibility with local systems.",
        sourceType: DemandSourceType.ACCOUNT,
        status: DemandStatus.VALIDATING,
        urgency: 5,
        accountId: accountByName.get("Pilsen Region Care Program")?.id,
        ownerId: userByName.get("Ondra")?.id
      },
      {
        title: "Kardi AI partner proposes risk triage extension",
        description: "Pilot cardiology risk scoring on symptom handoff.",
        sourceType: DemandSourceType.PARTNER,
        status: DemandStatus.NEW,
        urgency: 3,
        partnerId: partnerByName.get("Kardi AI")?.id,
        ownerId: userByName.get("Pavel")?.id
      },
      {
        title: "Infermedica expanded recommendation flow",
        description: "Expose recommendation_specialist pathway for teleconsultation routing.",
        sourceType: DemandSourceType.PARTNER,
        status: DemandStatus.PLANNED,
        urgency: 4,
        partnerId: partnerByName.get("Infermedica")?.id,
        ownerId: userByName.get("Sergei")?.id
      }
    ].map((d) => prisma.demand.create({ data: d }))
  );

  const seededInitiatives = await prisma.initiative.findMany({ include: { features: true } });
  const demandLinkData = [
    { demand: demands[0], initiativeTitle: "B2B client zone (employer/local government portal)" },
    { demand: demands[1], initiativeTitle: "E-Recept + E-Zadanky integration" },
    { demand: demands[2], initiativeTitle: "Medicinske guidelines" },
    { demand: demands[3], initiativeTitle: "Webove rozhrani" }
  ];

  for (const row of demandLinkData) {
    const initiative = seededInitiatives.find((i) => i.title === row.initiativeTitle);
    if (!initiative) continue;
    await prisma.demandLink.create({
      data: {
        demandId: row.demand.id,
        initiativeId: initiative.id,
        featureId: initiative.features[0]?.id
      }
    });
  }

  // --- Marketing: Campaigns, Assets, CampaignLinks ---
  const campaigns = await Promise.all([
    prisma.campaign.create({
      data: {
        name: "Skoda Employee Wellness Launch",
        description: "Co-branded launch campaign with Skoda Auto for employee health onboarding.",
        type: CampaignType.PARTNER_COBRANDING,
        status: CampaignStatus.ACTIVE,
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-06-30"),
        budget: 25000,
        ownerId: userByName.get("Nelca")?.id
      }
    }),
    prisma.campaign.create({
      data: {
        name: "Pilsen Region Digital Health Webinar",
        description: "Educational webinar series for Pilsen region municipality stakeholders.",
        type: CampaignType.WEBINAR,
        status: CampaignStatus.DRAFT,
        startDate: new Date("2026-05-15"),
        endDate: new Date("2026-05-15"),
        budget: 5000,
        ownerId: userByName.get("Ondra")?.id
      }
    }),
    prisma.campaign.create({
      data: {
        name: "Kardi AI Partnership Announcement",
        description: "Product launch campaign for the Kardi AI cardiology triage integration.",
        type: CampaignType.PRODUCT_LAUNCH,
        status: CampaignStatus.DRAFT,
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-07-31"),
        budget: 15000,
        ownerId: userByName.get("Pavel")?.id
      }
    }),
    prisma.campaign.create({
      data: {
        name: "Summer Employer Referral Program",
        description: "Referral campaign targeting HR departments at mid-size employers.",
        type: CampaignType.REFERRAL,
        status: CampaignStatus.DRAFT,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-08-31"),
        budget: 10000,
        ownerId: userByName.get("Adela")?.id
      }
    }),
    prisma.campaign.create({
      data: {
        name: "VZP Insurance Pilot Event",
        description: "Demo event for VZP insurance pilot expansion stakeholders.",
        type: CampaignType.EVENT,
        status: CampaignStatus.ACTIVE,
        startDate: new Date("2026-04-15"),
        endDate: new Date("2026-04-15"),
        budget: 8000,
        ownerId: userByName.get("Adela")?.id
      }
    })
  ]);

  const patientPersona = personaByName.get("Patient")!;
  const employerPersona = personaByName.get("Employer")!;
  const doctorPersona = personaByName.get("Doctor")!;
  const b2bAdminPersona = personaByName.get("B2B Admin")!;

  await Promise.all([
    // Campaign 0: Skoda
    prisma.asset.create({
      data: {
        campaignId: campaigns[0].id, name: "Skoda Employee Landing Page",
        description: "Co-branded LP for Skoda employees to register.",
        type: AssetType.LANDING_PAGE, status: AssetStatus.PUBLISHED,
        url: "https://dd.health/skoda-wellness", personaId: patientPersona.id,
        partnerId: null, accountId: accountByName.get("Skoda Auto Employee Health")?.id
      }
    }),
    prisma.asset.create({
      data: {
        campaignId: campaigns[0].id, name: "Skoda Wellness Leaflet",
        description: "Printed leaflet for HR distribution.",
        type: AssetType.LEAFLET, status: AssetStatus.APPROVED,
        personaId: employerPersona.id
      }
    }),
    prisma.asset.create({
      data: {
        campaignId: campaigns[0].id, name: "Skoda Onboarding Email Sequence",
        description: "3-email drip sequence for new Skoda employees.",
        type: AssetType.EMAIL_TEMPLATE, status: AssetStatus.IN_REVIEW,
        personaId: patientPersona.id
      }
    }),
    // Campaign 1: Pilsen webinar
    prisma.asset.create({
      data: {
        campaignId: campaigns[1].id, name: "Pilsen Webinar Registration Page",
        type: AssetType.LANDING_PAGE, status: AssetStatus.DRAFT,
        url: "https://dd.health/pilsen-webinar", personaId: b2bAdminPersona.id
      }
    }),
    prisma.asset.create({
      data: {
        campaignId: campaigns[1].id, name: "Pilsen Webinar Presentation",
        type: AssetType.PRESENTATION, status: AssetStatus.DRAFT,
        personaId: doctorPersona.id
      }
    }),
    // Campaign 2: Kardi AI
    prisma.asset.create({
      data: {
        campaignId: campaigns[2].id, name: "Kardi AI Integration Banner",
        type: AssetType.BANNER, status: AssetStatus.DRAFT
      }
    }),
    prisma.asset.create({
      data: {
        campaignId: campaigns[2].id, name: "Kardi AI Partner Landing Page",
        type: AssetType.LANDING_PAGE, status: AssetStatus.DRAFT,
        url: "https://dd.health/kardi-ai"
      }
    }),
    // Campaign 3: Referral
    prisma.asset.create({
      data: {
        campaignId: campaigns[3].id, name: "Employer Referral Social Post",
        type: AssetType.SOCIAL_POST, status: AssetStatus.DRAFT,
        personaId: employerPersona.id
      }
    }),
    // Campaign 4: VZP
    prisma.asset.create({
      data: {
        campaignId: campaigns[4].id, name: "VZP Pilot Demo Video",
        type: AssetType.VIDEO, status: AssetStatus.PUBLISHED,
        url: "https://dd.health/vzp-demo", personaId: b2bAdminPersona.id
      }
    }),
    prisma.asset.create({
      data: {
        campaignId: campaigns[4].id, name: "VZP Event Leaflet",
        type: AssetType.LEAFLET, status: AssetStatus.APPROVED
      }
    })
  ]);

  // Campaign links — connect campaigns to initiatives, accounts, partners
  const b2bZoneInit = seededInitiatives.find((i) => i.title === "B2B client zone (employer/local government portal)");
  const eReceptInit = seededInitiatives.find((i) => i.title === "E-Recept + E-Zadanky integration");
  const guidelinesInit = seededInitiatives.find((i) => i.title === "Medicinske guidelines");
  const mktgInit = seededInitiatives.find((i) => i.title === "MKTG podpora (eventy, PPT), affiliate");
  const lpInit = seededInitiatives.find((i) => i.title === "LP pro obchod a klienty");

  await Promise.all([
    prisma.campaignLink.create({ data: { campaignId: campaigns[0].id, accountId: accountByName.get("Skoda Auto Employee Health")?.id, initiativeId: b2bZoneInit?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[1].id, accountId: accountByName.get("Pilsen Region Care Program")?.id, initiativeId: eReceptInit?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[2].id, partnerId: partnerByName.get("Kardi AI")?.id, initiativeId: guidelinesInit?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[3].id, initiativeId: mktgInit?.id } }),
    prisma.campaignLink.create({ data: { campaignId: campaigns[4].id, accountId: accountByName.get("VZP Insurance Pilot")?.id, initiativeId: lpInit?.id } }),
  ]);
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

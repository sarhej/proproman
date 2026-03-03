import { CommercialType, Horizon, InitiativeStatus, Priority, PrismaClient, UserRole } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
    await prisma.dependency.deleteMany();
    await prisma.risk.deleteMany();
    await prisma.decision.deleteMany();
    await prisma.feature.deleteMany();
    await prisma.initiativeRevenueStream.deleteMany();
    await prisma.initiativePersonaImpact.deleteMany();
    await prisma.initiative.deleteMany();
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
    const users = await Promise.all(teamNames.map((name, idx) => prisma.user.upsert({
        where: { email: `${name.toLowerCase()}@doctordigital.local` },
        create: {
            name,
            email: `${name.toLowerCase()}@doctordigital.local`,
            role: idx < 6 ? UserRole.ADMIN : UserRole.VIEWER
        },
        update: {
            role: idx < 6 ? UserRole.ADMIN : UserRole.VIEWER
        }
    })));
    const userByName = new Map(users.map((u) => [u.name, u]));
    const domains = await Promise.all([
        { name: "Klient", color: "#7c3aed", sortOrder: 1 },
        { name: "Trzby", color: "#2563eb", sortOrder: 2 },
        { name: "Nad Ramec", color: "#059669", sortOrder: 3 },
        { name: "B2B", color: "#0f766e", sortOrder: 4 },
        { name: "Compliance", color: "#dc2626", sortOrder: 5 },
        { name: "Platforma", color: "#d97706", sortOrder: 6 }
    ].map((d) => prisma.domain.create({
        data: d
    })));
    const domainByName = new Map(domains.map((d) => [d.name, d]));
    const personas = await Promise.all([
        { name: "Patient", icon: "user" },
        { name: "Doctor", icon: "stethoscope" },
        { name: "Employer", icon: "building" },
        { name: "Insurer", icon: "shield" },
        { name: "B2B Admin", icon: "briefcase" },
        { name: "Regulator", icon: "scale" }
    ].map((p) => prisma.persona.create({
        data: p
    })));
    const personaByName = new Map(personas.map((p) => [p.name, p]));
    const revenueStreams = await Promise.all([
        { name: "B2B", color: "#0ea5e9" },
        { name: "B2G2C", color: "#8b5cf6" },
        { name: "B2C", color: "#f97316" },
        { name: "Insurance", color: "#10b981" }
    ].map((s) => prisma.revenueStream.create({
        data: s
    })));
    const streamByName = new Map(revenueStreams.map((s) => [s.name, s]));
    const initiatives = [
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
                title: item.title,
                description: item.notes ?? null,
                domainId: domainByName.get(item.domain).id,
                ownerId: item.owner ? userByName.get(item.owner)?.id : null,
                priority: item.priority,
                horizon: item.horizon,
                status: item.status,
                commercialType: item.commercialType,
                isGap: item.isGap ?? false,
                sortOrder: index
            }
        });
        const patient = personaByName.get("Patient");
        const doctor = personaByName.get("Doctor");
        const employer = personaByName.get("Employer");
        const insurer = personaByName.get("Insurer");
        const b2bAdmin = personaByName.get("B2B Admin");
        const regulator = personaByName.get("Regulator");
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
        const streamRows = item.domain === "Trzby"
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
                revenueStreamId: streamByName.get(row.stream).id,
                weight: row.weight
            }))
        });
    }
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

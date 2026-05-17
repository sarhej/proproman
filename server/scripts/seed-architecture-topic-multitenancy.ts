/**
 * Upsert the multitenancy ArchitectureTopic for the Tymio hub workspace.
 *
 * Prerequisites:
 *   cd server && npx prisma migrate deploy
 *
 * Seed (pick one):
 *   cd server && npm run seed:architecture-topic-multitenancy
 *   # from repo root:
 *   npx tsx server/scripts/seed-architecture-topic-multitenancy.ts
 */
import { prisma } from "../src/db.js";

const TENANT_SLUG = "tymio";
const TOPIC_SLUG = "multitenancy";

const AS_IS_SUMMARY = `Workspace = tenant (customer org). Row-level tenantId on scoped models; Prisma extension filters when tenant context is active.
Browser hub uses /t/<workspace-slug>/… and /t/<slug>/api/…; legacy /api/… uses session + X-Tenant-Id.
MCP: POST /mcp is discovery-only; POST /t/<slug>/mcp pins tenant for all backlog and atlas tools.
Users are global; TenantMembership grants per-workspace roles; activeTenantId selects default workspace.`;

const DOC_PATHS = ["docs/HUB.md#12-multi-tenancy-as-implemented", "docs/CODING_AGENT_TYMIO.md"];

const SYNONYMS = ["tenant", "workspace", "multi-tenant", "multitenancy", "X-Tenant-Id"];

const INITIATIVE_TITLE_KEYWORDS = [
  "workspace navigation",
  "zero-friction agent",
  "realtime hub sync",
  "mcp",
  "authentication"
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    throw new Error(`Tenant "${TENANT_SLUG}" not found`);
  }

  const initiatives = await prisma.initiative.findMany({
    where: { tenantId: tenant.id, archivedAt: null },
    select: { id: true, title: true }
  });
  const initiativeIds = initiatives
    .filter((i) =>
      INITIATIVE_TITLE_KEYWORDS.some((k) => i.title.toLowerCase().includes(k.toLowerCase()))
    )
    .map((i) => i.id);

  const caps = await prisma.capability.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] },
      OR: [
        { slug: { contains: "tenant" } },
        { slug: { contains: "workspace" } },
        { slug: { contains: "mcp" } },
        { title: { contains: "tenant", mode: "insensitive" } },
        { title: { contains: "workspace", mode: "insensitive" } }
      ]
    },
    select: { id: true, slug: true }
  });

  const existing = await prisma.architectureTopic.findFirst({
    where: { tenantId: tenant.id, slug: TOPIC_SLUG }
  });

  const data = {
    title: "Multi-tenancy (workspaces)",
    asIsSummary: AS_IS_SUMMARY,
    toBeSummary:
      "Harden agent onboarding (pinned MCP, doctor), complete workspace navigation UX, tenant-scoped realtime sync, and integration connectors with per-tenant isolation.",
    synonyms: SYNONYMS,
    docPaths: DOC_PATHS,
    autoMatchCapabilities: true,
    sortOrder: 0
  };

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.architectureTopicInitiative.deleteMany({ where: { architectureTopicId: existing.id } });
      await tx.architectureTopicCapability.deleteMany({ where: { architectureTopicId: existing.id } });
      await tx.architectureTopic.update({
        where: { id: existing.id },
        data: {
          ...data,
          synonyms: data.synonyms,
          docPaths: data.docPaths,
          initiativeLinks: {
            createMany: { data: initiativeIds.map((initiativeId) => ({ initiativeId })) }
          },
          capabilityLinks: {
            createMany: { data: caps.map((c) => ({ capabilityId: c.id })) }
          }
        }
      });
    });
    console.log(`Updated architecture topic "${TOPIC_SLUG}" (${existing.id})`);
  } else {
    const created = await prisma.architectureTopic.create({
      data: {
        tenantId: tenant.id,
        slug: TOPIC_SLUG,
        ...data,
        synonyms: data.synonyms,
        docPaths: data.docPaths,
        initiativeLinks: {
          createMany: { data: initiativeIds.map((initiativeId) => ({ initiativeId })) }
        },
        capabilityLinks: {
          createMany: { data: caps.map((c) => ({ capabilityId: c.id })) }
        }
      }
    });
    console.log(`Created architecture topic "${TOPIC_SLUG}" (${created.id})`);
  }

  console.log(`Linked ${initiativeIds.length} initiatives, ${caps.length} capabilities`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

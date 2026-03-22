import { BindingType, CapabilityStatus } from "@prisma/client";
import { prisma } from "../db.js";

/** Default ontology rows + generated bindings (idempotent). */
const DEFAULT_CAPABILITIES: {
  slug: string;
  title: string;
  userJob: string;
  description?: string;
  doNotConfuseWith?: string;
  status: CapabilityStatus;
  sortOrder: number;
  bindings: { type: BindingType; key: string; isPrimary?: boolean }[];
}[] = [
  {
    slug: "domain-board",
    title: "Domain board",
    userJob: "See and reorder initiatives by domain pillar on the main board.",
    status: "ACTIVE",
    sortOrder: 10,
    bindings: [
      { type: "ROUTE", key: "/", isPrimary: true },
      { type: "PAGE", key: "DomainBoardPage" }
    ]
  },
  {
    slug: "prioritization",
    title: "Priority grid",
    userJob: "Compare initiative priority in a grid view.",
    status: "ACTIVE",
    sortOrder: 20,
    bindings: [{ type: "ROUTE", key: "/priority", isPrimary: true }, { type: "PAGE", key: "PriorityGridPage" }]
  },
  {
    slug: "raci",
    title: "RACI matrix",
    userJob: "Assign accountable / implementer / consulted / informed roles per initiative.",
    status: "ACTIVE",
    sortOrder: 30,
    bindings: [{ type: "ROUTE", key: "/raci", isPrimary: true }, { type: "PRISMA_MODEL", key: "InitiativeAssignment" }]
  },
  {
    slug: "status-kanban",
    title: "Status kanban",
    userJob: "Move initiatives across status columns.",
    status: "ACTIVE",
    sortOrder: 40,
    bindings: [{ type: "ROUTE", key: "/status-kanban", isPrimary: true }]
  },
  {
    slug: "accountability-board",
    title: "Accountability board",
    userJob: "Reassign accountable owner across initiatives.",
    status: "ACTIVE",
    sortOrder: 50,
    bindings: [{ type: "ROUTE", key: "/accountability", isPrimary: true }]
  },
  {
    slug: "insights-views",
    title: "KPI, heatmap, buyer×user, gaps",
    userJob: "Analyze initiatives via KPI dashboard, stakeholder heatmap, buyer/user matrix, and gaps view.",
    status: "ACTIVE",
    sortOrder: 60,
    bindings: [
      { type: "ROUTE", key: "/kpi-dashboard" },
      { type: "ROUTE", key: "/heatmap" },
      { type: "ROUTE", key: "/buyer-user" },
      { type: "ROUTE", key: "/gaps", isPrimary: true }
    ]
  },
  {
    slug: "product-explorer",
    title: "Product explorer",
    userJob: "Navigate product line → initiative → feature → requirement tree; structure edits for admins.",
    status: "ACTIVE",
    sortOrder: 70,
    bindings: [
      { type: "ROUTE", key: "/product-explorer", isPrimary: true },
      { type: "PAGE", key: "ProductExplorerPage" },
      { type: "PRISMA_MODEL", key: "Product" },
      { type: "PRISMA_MODEL", key: "Initiative" },
      { type: "PRISMA_MODEL", key: "Feature" },
      { type: "PRISMA_MODEL", key: "Requirement" },
      { type: "MCP_TOOL", key: "drd_get_product_tree" }
    ]
  },
  {
    slug: "b2b-context",
    title: "Accounts, demands, partners",
    userJob: "Manage customer accounts, partner records, and demands linked to work items.",
    status: "ACTIVE",
    sortOrder: 80,
    bindings: [
      { type: "ROUTE", key: "/accounts" },
      { type: "ROUTE", key: "/demands" },
      { type: "ROUTE", key: "/partners", isPrimary: true },
      { type: "PRISMA_MODEL", key: "Account" },
      { type: "PRISMA_MODEL", key: "Demand" },
      { type: "PRISMA_MODEL", key: "DemandLink" },
      { type: "PRISMA_MODEL", key: "Partner" },
      { type: "MCP_TOOL", key: "drd_list_demands" },
      { type: "MCP_TOOL", key: "drd_list_accounts" },
      { type: "MCP_TOOL", key: "drd_list_partners" }
    ]
  },
  {
    slug: "marketing",
    title: "Campaigns and assets",
    userJob: "Plan campaigns and marketing assets; link to initiatives, accounts, partners.",
    status: "ACTIVE",
    sortOrder: 90,
    bindings: [
      { type: "ROUTE", key: "/campaigns", isPrimary: true },
      { type: "PRISMA_MODEL", key: "Campaign" },
      { type: "PRISMA_MODEL", key: "Asset" },
      { type: "PRISMA_MODEL", key: "CampaignLink" },
      { type: "MCP_TOOL", key: "drd_list_campaigns" }
    ]
  },
  {
    slug: "timeline",
    title: "Milestones, calendar, Gantt",
    userJob: "Track milestones timeline, calendar, and Gantt views.",
    status: "ACTIVE",
    sortOrder: 100,
    bindings: [
      { type: "ROUTE", key: "/milestones" },
      { type: "ROUTE", key: "/calendar" },
      { type: "ROUTE", key: "/gantt", isPrimary: true },
      { type: "PRISMA_MODEL", key: "InitiativeMilestone" },
      { type: "MCP_TOOL", key: "drd_list_milestones" },
      { type: "MCP_TOOL", key: "drd_timeline_calendar" },
      { type: "MCP_TOOL", key: "drd_timeline_gantt" }
    ]
  },
  {
    slug: "feature-requirement-detail",
    title: "Feature and requirement detail",
    userJob: "Edit a single feature or requirement; kanban for requirements.",
    status: "ACTIVE",
    sortOrder: 110,
    bindings: [
      { type: "ROUTE", key: "/features/:featureId" },
      { type: "ROUTE", key: "/requirements/:requirementId" },
      { type: "ROUTE", key: "/requirements/kanban", isPrimary: true },
      { type: "MCP_TOOL", key: "drd_list_features" },
      { type: "MCP_TOOL", key: "drd_list_requirements" }
    ]
  },
  {
    slug: "administration",
    title: "Admin",
    userJob: "Manage users, reference data, import/export, ontology, audit, notification rules.",
    status: "ACTIVE",
    sortOrder: 120,
    bindings: [{ type: "ROUTE", key: "/admin", isPrimary: true }, { type: "PAGE", key: "AdminPage" }]
  },
  {
    slug: "mcp-agents",
    title: "MCP agent access",
    userJob: "Agents call the same APIs via MCP tools with user permissions (remote OAuth or stdio API key).",
    description: "Remote: POST /mcp with OAuth. Local: mcp package with API_KEY.",
    status: "ACTIVE",
    sortOrder: 130,
    bindings: [
      { type: "MCP_TOOL", key: "drd_meta", isPrimary: true },
      { type: "MCP_TOOL", key: "drd_list_initiatives" },
      { type: "MCP_TOOL", key: "tymio_get_coding_agent_guide" },
      { type: "MCP_TOOL", key: "tymio_get_agent_brief" },
      { type: "MCP_TOOL", key: "tymio_list_capabilities" },
      { type: "MCP_TOOL", key: "tymio_get_capability" },
      { type: "INFRA", key: "server/src/mcp/tools.ts" }
    ]
  }
];

export async function refreshGeneratedOntology(): Promise<{ capabilitiesUpserted: number; bindingsUpserted: number }> {
  let caps = 0;
  let binds = 0;

  for (const def of DEFAULT_CAPABILITIES) {
    const cap = await prisma.capability.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        title: def.title,
        description: def.description ?? null,
        userJob: def.userJob,
        doNotConfuseWith: def.doNotConfuseWith ?? null,
        status: def.status,
        sortOrder: def.sortOrder
      },
      update: {
        title: def.title,
        description: def.description ?? null,
        userJob: def.userJob,
        doNotConfuseWith: def.doNotConfuseWith ?? null,
        status: def.status,
        sortOrder: def.sortOrder
      }
    });
    caps++;

    for (const b of def.bindings) {
      await prisma.capabilityBinding.upsert({
        where: {
          capabilityId_bindingType_bindingKey: {
            capabilityId: cap.id,
            bindingType: b.type,
            bindingKey: b.key
          }
        },
        create: {
          capabilityId: cap.id,
          bindingType: b.type,
          bindingKey: b.key,
          isPrimary: b.isPrimary ?? false,
          generated: true
        },
        update: {
          isPrimary: b.isPrimary ?? false,
          generated: true
        }
      });
      binds++;
    }
  }

  return { capabilitiesUpserted: caps, bindingsUpserted: binds };
}

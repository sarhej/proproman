import { Prisma } from "@prisma/client";

export const initiativeInclude = {
  product: true,
  domain: true,
  owner: true,
  personaImpacts: {
    include: {
      persona: true
    }
  },
  revenueWeights: {
    include: {
      revenueStream: true
    }
  },
  features: {
    include: {
      owner: true,
      requirements: true,
      demandLinks: {
        include: {
          demand: {
            include: {
              account: true,
              partner: true
            }
          }
        }
      }
    },
    orderBy: {
      sortOrder: "asc" as const
    }
  },
  decisions: true,
  risks: {
    include: {
      owner: true
    }
  },
  assignments: {
    include: {
      user: true
    }
  },
  demandLinks: {
    include: {
      demand: {
        include: {
          account: true,
          partner: true
        }
      },
      feature: true
    }
  },
  outgoingDeps: true,
  incomingDeps: true,
  milestones: {
    include: { owner: true },
    orderBy: { sequence: "asc" as const },
  },
  kpis: true,
  stakeholders: true,
} satisfies Prisma.InitiativeInclude;

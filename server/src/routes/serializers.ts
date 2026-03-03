import { Prisma } from "@prisma/client";

export const initiativeInclude = {
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
      owner: true
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
  outgoingDeps: true,
  incomingDeps: true
} satisfies Prisma.InitiativeInclude;

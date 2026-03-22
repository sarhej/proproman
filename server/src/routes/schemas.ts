import { CommercialType, DateConfidence, DealStage, Horizon, InitiativeStatus, Priority, StrategicTier } from "@prisma/client";
import { z } from "zod";

export const initiativeInputSchema = z.object({
  title: z.string().min(1),
  productId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  domainId: z.string().min(1),
  ownerId: z.string().nullable().optional(),
  priority: z.nativeEnum(Priority),
  horizon: z.nativeEnum(Horizon),
  status: z.nativeEnum(InitiativeStatus),
  commercialType: z.nativeEnum(CommercialType),
  isGap: z.boolean().default(false),
  startDate: z.string().datetime().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  milestoneDate: z.string().datetime().nullable().optional(),
  dateConfidence: z.nativeEnum(DateConfidence).nullable().optional(),
  arrImpact: z.number().nullable().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  dealStage: z.nativeEnum(DealStage).nullable().optional(),
  strategicTier: z.nativeEnum(StrategicTier).nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  personaImpacts: z
    .array(
      z.object({
        personaId: z.string(),
        impact: z.number().int().min(1).max(5)
      })
    )
    .optional(),
  revenueWeights: z
    .array(
      z.object({
        revenueStreamId: z.string(),
        weight: z.number().int().min(0).max(100)
      })
    )
    .optional(),
  demandLinks: z
    .array(
      z.object({
        demandId: z.string(),
        featureId: z.string().nullable().optional()
      })
    )
    .optional(),
  assignments: z
    .array(
      z.object({
        userId: z.string(),
        role: z.enum(["ACCOUNTABLE", "IMPLEMENTER", "CONSULTED", "INFORMED"]),
        allocation: z.number().int().min(0).max(100).nullable().optional()
      })
    )
    .optional()
});

export const updatePositionsSchema = z.array(
  z.object({
    id: z.string(),
    domainId: z.string(),
    sortOrder: z.number().int()
  })
);

/** Reorder features within one initiative: must include every feature id for that initiative exactly once. */
export const featureReorderSchema = z.array(
  z.object({
    id: z.string(),
    sortOrder: z.number().int()
  })
);

/** Reorder requirements within one feature: must include every requirement id for that feature exactly once. */
export const requirementReorderSchema = z.array(
  z.object({
    id: z.string(),
    sortOrder: z.number().int()
  })
);

import { CommercialType, Horizon, InitiativeStatus, Priority } from "@prisma/client";
import { z } from "zod";

export const initiativeInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  domainId: z.string().min(1),
  ownerId: z.string().nullable().optional(),
  priority: z.nativeEnum(Priority),
  horizon: z.nativeEnum(Horizon),
  status: z.nativeEnum(InitiativeStatus),
  commercialType: z.nativeEnum(CommercialType),
  isGap: z.boolean().default(false),
  targetDate: z.string().datetime().nullable().optional(),
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
    .optional()
});

export const updatePositionsSchema = z.array(
  z.object({
    id: z.string(),
    domainId: z.string(),
    sortOrder: z.number().int()
  })
);

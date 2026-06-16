export type HubChangeEntityType =
  | "INITIATIVE"
  | "FEATURE"
  | "REQUIREMENT"
  | "PRODUCT"
  | "DOMAIN"
  | "ATLAS_AUXILIARY";
export type HubChangeOperation = "CREATE" | "UPDATE" | "DELETE" | "REORDER";

export type HubChangeEventPayload = {
  eventId: string;
  tenantId: string;
  entityType: HubChangeEntityType;
  operation: HubChangeOperation;
  changedAt: string;
  entityId?: string | null;
  initiativeId?: string | null;
};

/** Hub writes that should refetch Products & Systems (`/api/products` + meta). */
export const PRODUCT_EXPLORER_HUB_ENTITIES: ReadonlySet<HubChangeEntityType> = new Set([
  "PRODUCT",
  "INITIATIVE",
  "FEATURE",
  "REQUIREMENT",
  "DOMAIN"
]);

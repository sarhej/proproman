export type HubChangeEntityType = "INITIATIVE" | "FEATURE" | "REQUIREMENT";
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

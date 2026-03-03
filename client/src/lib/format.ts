import type { CommercialType, Horizon, InitiativeStatus, Priority } from "../types/models";

export function formatPriority(priority: Priority): string {
  return priority;
}

export function formatHorizon(horizon: Horizon): string {
  return horizon === "NOW" ? "Now" : horizon === "NEXT" ? "Next" : "Later";
}

export function formatStatus(status: InitiativeStatus): string {
  return status.replaceAll("_", " ").toLowerCase();
}

export function formatCommercial(type: CommercialType): string {
  return type.replaceAll("_", " ").toLowerCase();
}

export function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

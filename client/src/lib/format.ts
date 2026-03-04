import i18n from "../i18n";
import type { CommercialType, Horizon, InitiativeStatus, Priority } from "../types/models";

export function formatPriority(priority: Priority): string {
  return i18n.t(`priority.${priority}`) ?? priority;
}

export function formatHorizon(horizon: Horizon): string {
  return i18n.t(`horizon.${horizon}`) ?? horizon;
}

export function formatStatus(status: InitiativeStatus): string {
  return i18n.t(`status.${status}`) ?? status.replaceAll("_", " ").toLowerCase();
}

export function formatCommercial(type: CommercialType): string {
  return i18n.t(`commercialType.${type}`) ?? type.replaceAll("_", " ").toLowerCase();
}

export function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

import { useTranslation } from "react-i18next";
import type { Domain, User } from "../../types/models";
import { formatPriority } from "../../lib/format";
import { LabelEditor } from "../ui/LabelEditor";
import { Input, Label, Select } from "../ui/Field";

type Props = {
  domains: Domain[];
  users: User[];
  labelSuggestions?: string[];
  filters: {
    domainId?: string;
    ownerId?: string;
    priority?: string;
    horizon?: string;
    labels?: string[];
    isGap?: boolean;
    archived?: boolean;
    quick?: string;
    searchInAllFields?: boolean;
  };
  onChange: (patch: Partial<Props["filters"]>) => void;
};

export function FiltersBar({ domains, users, labelSuggestions = [], filters, onChange }: Props) {
  const { t } = useTranslation();
  const selectedDomain = filters.domainId ? domains.find((d) => d.id === filters.domainId) : null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
      {/* Mobile: quick filter only */}
      <div className="lg:hidden">
        <Input
          value={filters.quick || ""}
          placeholder={t("filters.searchPlaceholder")}
          onChange={(e) => onChange({ quick: e.target.value || undefined })}
          className="w-full text-base"
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={filters.searchInAllFields === true}
            onChange={(e) => onChange({ searchInAllFields: e.target.checked ? true : undefined })}
            className="rounded border-slate-300"
          />
          {t("filters.searchInAllFields")}
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("filters.labels")}
          </span>
          <LabelEditor
            compact
            className="min-w-0 flex-1"
            labels={filters.labels ?? []}
            suggestions={labelSuggestions}
            placeholder={t("filters.labelsPlaceholder")}
            onChange={(labels) => onChange({ labels: labels.length > 0 ? labels : undefined })}
          />
        </div>
      </div>
      {/* Desktop: full filter grid */}
      <div className="hidden lg:grid grid-cols-6 gap-3">
        <div>
          <Label>{t("filters.domain")}</Label>
          <div className="relative">
            {selectedDomain && (
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                style={{ background: selectedDomain.color }}
              />
            )}
            <Select
              value={filters.domainId || ""}
              onChange={(e) => onChange({ domainId: e.target.value || undefined })}
              className={selectedDomain ? "pl-7" : ""}
            >
              <option value="">{t("filters.all")}</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>{t("filters.owner")}</Label>
          <Select value={filters.ownerId || ""} onChange={(e) => onChange({ ownerId: e.target.value || undefined })}>
            <option value="">{t("filters.all")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("filters.priority")}</Label>
          <Select value={filters.priority || ""} onChange={(e) => onChange({ priority: e.target.value || undefined })}>
            <option value="">{t("filters.all")}</option>
            <option value="P0">{formatPriority("P0")}</option>
            <option value="P1">{formatPriority("P1")}</option>
            <option value="P2">{formatPriority("P2")}</option>
            <option value="P3">{formatPriority("P3")}</option>
          </Select>
        </div>
        <div>
          <Label>{t("filters.horizon")}</Label>
          <Select value={filters.horizon || ""} onChange={(e) => onChange({ horizon: e.target.value || undefined })}>
            <option value="">{t("filters.all")}</option>
            <option value="NOW">{t("horizon.NOW")}</option>
            <option value="NEXT">{t("horizon.NEXT")}</option>
            <option value="LATER">{t("horizon.LATER")}</option>
          </Select>
        </div>
        <div className="col-span-2">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Label>{t("filters.quickFilter")}</Label>
              <Input
                value={filters.quick || ""}
                placeholder={t("filters.searchPlaceholder")}
                onChange={(e) => onChange({ quick: e.target.value || undefined })}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 pb-0.5">
              <label className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={filters.archived === true}
                  onChange={(e) => onChange({ archived: e.target.checked || undefined })}
                  className="rounded border-slate-300"
                />
                {t("filters.showArchived")}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={filters.searchInAllFields === true}
                  onChange={(e) => onChange({ searchInAllFields: e.target.checked ? true : undefined })}
                  className="rounded border-slate-300"
                />
                {t("filters.searchInAllFields")}
              </label>
            </div>
          </div>
        </div>
        <div className="col-span-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("filters.labels")}
          </span>
          <LabelEditor
            compact
            className="min-w-0 flex-1"
            labels={filters.labels ?? []}
            suggestions={labelSuggestions}
            placeholder={t("filters.labelsPlaceholder")}
            onChange={(labels) => onChange({ labels: labels.length > 0 ? labels : undefined })}
          />
        </div>
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import type { Domain, User } from "../../types/models";
import { Input, Label, Select } from "../ui/Field";

type Props = {
  domains: Domain[];
  users: User[];
  filters: {
    domainId?: string;
    ownerId?: string;
    priority?: string;
    horizon?: string;
    isGap?: boolean;
    quick?: string;
  };
  onChange: (patch: Partial<Props["filters"]>) => void;
};

export function FiltersBar({ domains, users, filters, onChange }: Props) {
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
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
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
          <Label>{t("filters.quickFilter")}</Label>
          <Input
            value={filters.quick || ""}
            placeholder={t("filters.searchPlaceholder")}
            onChange={(e) => onChange({ quick: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  );
}

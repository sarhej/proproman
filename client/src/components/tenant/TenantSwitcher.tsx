import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import type { Tenant, TenantMembership } from "../../types/models";

type Props = {
  activeTenant: Tenant | null;
  onSwitch: (tenant: Tenant) => void;
  compact?: boolean;
};

export function TenantSwitcher({ activeTenant, onSwitch, compact }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const loadTenants = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await api.getMyTenants();
      setMemberships(res.tenants);
      setLoaded(true);
    } catch {
      setMemberships([]);
    }
  }, [loaded]);

  const handleToggle = useCallback(() => {
    setOpen((o) => !o);
    if (!open) void loadTenants();
  }, [open, loadTenants]);

  const handleSelect = useCallback(async (tenant: Tenant) => {
    setOpen(false);
    try {
      await api.switchTenant(tenant.id);
      onSwitch(tenant);
    } catch {
      // ignore — user will see stale tenant
    }
  }, [onSwitch]);

  if (!activeTenant) return null;

  // Single tenant — no switcher needed, just show name
  if (loaded && memberships.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Building2 size={14} className="text-slate-400" />
        <span className={compact ? "max-w-[100px] truncate" : ""}>{activeTenant.name}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Building2 size={14} className="text-slate-400" />
        <span className={compact ? "max-w-[100px] truncate" : "max-w-[160px] truncate"}>
          {activeTenant.name}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-2 text-xs font-semibold uppercase text-slate-400">
            {t("tenant.workspaces")}
          </div>
          {memberships.map((m) => (
            <button
              key={m.tenant.id}
              type="button"
              onClick={() => handleSelect(m.tenant)}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 ${
                m.tenant.id === activeTenant.id ? "bg-sky-50 text-sky-800" : "text-slate-700"
              }`}
            >
              <span className="truncate font-medium">{m.tenant.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-slate-400">{m.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

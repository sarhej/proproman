import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { APP_LOCALE_CODES, canManageWorkspaceLanguages, type AppLocaleCode } from "../lib/appLocales";
import { MANAGED_NAV_PATHS } from "../lib/navViewPaths";
import { navSections } from "../lib/navSections";
import type { Tenant, User } from "../types/models";

export function WorkspaceSettingsPage({
  user,
  activeTenant,
  onSaved,
  /** Nav visibility only — avoid full auth refresh so checkboxes do not flash disabled across the list. */
  onNavViewsSaved,
}: {
  user: User;
  activeTenant: Tenant | null;
  onSaved: () => void;
  onNavViewsSaved?: () => void;
}) {
  const { t } = useTranslation();
  const can = canManageWorkspaceLanguages(user.role, activeTenant);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(APP_LOCALE_CODES));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const base =
      activeTenant?.enabledLocales && activeTenant.enabledLocales.length > 0
        ? activeTenant.enabledLocales
        : [...APP_LOCALE_CODES];
    setSelected(new Set(base));
  }, [activeTenant?.id, activeTenant?.enabledLocales?.join(",")]);

  function toggle(code: AppLocaleCode) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size <= 1) return prev;
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
    setOk(false);
  }

  async function save() {
    if (selected.size === 0) {
      setErr(t("workspaceSettings.minOne"));
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      await api.patchActiveTenantLanguages({ enabledLocales: [...selected] });
      setOk(true);
      onSaved();
    } catch {
      setErr(t("workspaceSettings.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  if (!activeTenant) {
    return <p className="text-sm text-slate-600">{t("workspaceSettings.needWorkspace")}</p>;
  }
  if (!can) {
    return <p className="text-sm text-slate-600">{t("workspaceSettings.noAccess")}</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("workspaceSettings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("workspaceSettings.intro")}</p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">{t("workspaceSettings.languagesTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("workspaceSettings.languagesDesc")}</p>
        <ul className="mt-4 grid gap-2">
          {APP_LOCALE_CODES.map((code) => (
            <label
              key={code}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(code)}
                onChange={() => toggle(code)}
                disabled={selected.has(code) && selected.size <= 1}
              />
              <span className="text-sm font-medium text-slate-800">{t(`lang.${code}`)}</span>
              <span className="font-mono text-xs text-slate-400">{code}</span>
            </label>
          ))}
        </ul>
      </section>
      <WorkspaceNavViewsSection onSaved={onNavViewsSaved ?? onSaved} />
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {ok ? <p className="text-sm text-emerald-600">{t("workspaceSettings.saved")}</p> : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {busy ? t("workspaceSettings.saving") : t("workspaceSettings.save")}
      </button>
    </div>
  );
}

function mergeSets(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a, ...b]);
}

function WorkspaceNavViewsSection({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const [globalHidden, setGlobalHidden] = useState<Set<string>>(new Set());
  const [tenantHidden, setTenantHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  /** Only the row being saved is disabled — avoids all checkboxes flickering via global disabled={busy}. */
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const effectiveHidden = useMemo(() => mergeSets(globalHidden, tenantHidden), [globalHidden, tenantHidden]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api.getUiSettings();
      setGlobalHidden(new Set(data.globalHiddenNavPaths ?? []));
      setTenantHidden(new Set(data.tenantHiddenNavPaths ?? []));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleCount = MANAGED_NAV_PATHS.length - effectiveHidden.size;

  const setPathVisible = async (path: string, visible: boolean) => {
    if (savingPath !== null) {
      return;
    }
    if (!visible && globalHidden.has(path)) {
      return;
    }
    const nextTenant = new Set(tenantHidden);
    if (visible) {
      nextTenant.delete(path);
    } else {
      if (visibleCount <= 1 && !effectiveHidden.has(path)) {
        setErr(t("admin.navViews.keepOne"));
        return;
      }
      nextTenant.add(path);
    }
    setSavingPath(path);
    setErr(null);
    try {
      await api.updateUiSettingsWorkspace({ hiddenNavPaths: Array.from(nextTenant) });
      setTenantHidden(nextTenant);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      void load();
    } finally {
      setSavingPath(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">{t("workspaceSettings.navViewsTitle")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("workspaceSettings.navViewsDesc")}</p>
      {err ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      <div className="mt-4 space-y-4">
        {navSections
          .filter((s) => !s.adminOnly)
          .map((section) => {
            const rows = section.items.filter((i) => (MANAGED_NAV_PATHS as readonly string[]).includes(i.to));
            if (rows.length === 0) return null;
            return (
              <div key={section.labelKey} className="rounded border border-slate-100 bg-slate-50/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t(section.labelKey)}
                </h3>
                <ul className="space-y-2">
                  {rows.map((item) => {
                    const visible = !effectiveHidden.has(item.to);
                    const platformLocked = globalHidden.has(item.to);
                    const disableOff = visible && visibleCount <= 1;
                    return (
                      <li key={item.to} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-800">{t(item.labelKey)}</span>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={visible}
                            disabled={
                              platformLocked || (disableOff && visible) || savingPath === item.to
                            }
                            onChange={(e) => void setPathVisible(item.to, e.target.checked)}
                          />
                          {t("admin.navViews.visible")}
                        </label>
                        {platformLocked ? (
                          <span className="text-[10px] font-medium text-amber-700">{t("workspaceSettings.navViewsPlatform")}</span>
                        ) : null}
                        <code className="text-[10px] text-slate-400">{item.to}</code>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
      </div>
    </section>
  );
}

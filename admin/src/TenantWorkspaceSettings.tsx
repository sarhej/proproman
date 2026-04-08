import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Button } from "./Button";

const LOCALE_CODES = ["en", "cs", "sk", "uk", "pl"] as const;
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  cs: "Czech",
  sk: "Slovak",
  uk: "Ukrainian",
  pl: "Polish",
};

export function TenantWorkspaceSettings({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [langOk, setLangOk] = useState(false);
  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(() => new Set(LOCALE_CODES));
  const [globalHidden, setGlobalHidden] = useState<Set<string>>(new Set());
  const [tenantHidden, setTenantHidden] = useState<Set<string>>(new Set());
  const [managedPaths, setManagedPaths] = useState<string[]>([]);
  const [langBusy, setLangBusy] = useState(false);
  const [savingPath, setSavingPath] = useState<string | null>(null);

  const effectiveHidden = useMemo(
    () => new Set([...globalHidden, ...tenantHidden]),
    [globalHidden, tenantHidden]
  );

  const visibleCount = useMemo(() => {
    return managedPaths.filter((p) => !effectiveHidden.has(p)).length;
  }, [managedPaths, effectiveHidden]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api.getTenantWorkspaceSettings(tenantId);
      setManagedPaths(data.managedNavPaths);
      setSelectedLocales(new Set(data.enabledLocales));
      setGlobalHidden(new Set(data.globalHiddenNavPaths));
      setTenantHidden(new Set(data.tenantHiddenNavPaths));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveLanguages = async () => {
    if (selectedLocales.size === 0) return;
    setLangBusy(true);
    setLangOk(false);
    setErr(null);
    try {
      await api.patchTenantWorkspaceLanguages(tenantId, { enabledLocales: [...selectedLocales] });
      setLangOk(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLangBusy(false);
    }
  };

  const setPathVisible = async (path: string, visible: boolean) => {
    if (savingPath) return;
    if (!visible && globalHidden.has(path)) return;
    const nextTenant = new Set(tenantHidden);
    if (visible) {
      nextTenant.delete(path);
    } else {
      if (visibleCount <= 1 && !effectiveHidden.has(path)) {
        setErr("At least one navigation view must remain visible for members.");
        return;
      }
      nextTenant.add(path);
    }
    setSavingPath(path);
    setErr(null);
    try {
      await api.putTenantWorkspaceNavVisibility(tenantId, { hiddenNavPaths: [...nextTenant] });
      setTenantHidden(nextTenant);
    } catch (e) {
      setErr((e as Error).message);
      void load();
    } finally {
      setSavingPath(null);
    }
  };

  function toggleLocale(code: string) {
    setSelectedLocales((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size <= 1) return prev;
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
    setLangOk(false);
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Loading workspace shell settings…
      </div>
    );
  }

  return (
    <div id="workspace-shell-settings" className="mt-6 space-y-6 scroll-mt-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Workspace shell settings</h3>
        <p className="mt-1 text-xs text-slate-500">
          Languages and sidebar routes for this workspace (same as workspace-owner settings in the hub, without opening
          the product SPA).
        </p>
      </div>
      {err ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      ) : null}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-slate-800">Languages</h4>
        <p className="mt-1 text-xs text-slate-500">Locales available in the app header for this workspace.</p>
        <ul className="mt-3 grid gap-2">
          {LOCALE_CODES.map((code) => (
            <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedLocales.has(code)}
                disabled={selectedLocales.has(code) && selectedLocales.size <= 1}
                onChange={() => toggleLocale(code)}
              />
              {LOCALE_LABELS[code]} <span className="font-mono text-xs text-slate-400">{code}</span>
            </label>
          ))}
        </ul>
        <Button className="mt-3" size="sm" onClick={() => void saveLanguages()} disabled={langBusy}>
          {langBusy ? "Saving…" : "Save languages"}
        </Button>
        {langOk ? <p className="mt-2 text-xs text-emerald-600">Languages saved.</p> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-slate-800">Navigation views</h4>
        <p className="mt-1 text-xs text-slate-500">
          Hide hub routes for this workspace only. Platform-hidden routes cannot be turned back on here.
        </p>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {managedPaths.map((path) => {
            const visible = !effectiveHidden.has(path);
            const platformLocked = globalHidden.has(path);
            const disableOff = visible && visibleCount <= 1;
            return (
              <li
                key={path}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0"
              >
                <code className="text-xs text-slate-700">{path}</code>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={platformLocked || (disableOff && visible) || savingPath === path}
                    onChange={(e) => void setPathVisible(path, e.target.checked)}
                  />
                  Visible
                </label>
                {platformLocked ? <span className="text-[10px] font-medium text-amber-700">Platform</span> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

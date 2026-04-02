import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { APP_LOCALE_CODES, canManageWorkspaceLanguages, type AppLocaleCode } from "../lib/appLocales";
import type { Tenant, User } from "../types/models";

export function WorkspaceSettingsPage({
  user,
  activeTenant,
  onSaved,
}: {
  user: User;
  activeTenant: Tenant | null;
  onSaved: () => void;
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

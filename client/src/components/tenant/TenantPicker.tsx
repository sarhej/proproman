import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { Tenant, TenantMembership } from "../../types/models";
import { Card } from "../ui/Card";

type Props = {
  onSelected: (tenant: Tenant) => void;
};

export function TenantPicker({ onSelected }: Props) {
  const { t } = useTranslation();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [regRequests, setRegRequests] = useState<
    Array<{ id: string; teamName: string; slug: string; status: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.getMyTenants();
        let regs: Array<{ id: string; teamName: string; slug: string; status: string }> = [];
        try {
          regs = (await api.getMyWorkspaceRegistrationRequests()).requests;
        } catch {
          /* optional: user may lack session in edge cases */
        }
        if (!cancelled) {
          setMemberships(res.tenants);
          setRegRequests(regs);
          if (res.tenants.length === 1) {
            await handleSelect(res.tenants[0].tenant);
            return;
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = useCallback(async (tenant: Tenant) => {
    setSwitching(tenant.id);
    setError(null);
    try {
      await api.switchTenant(tenant.id);
      onSelected(tenant);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwitching(null);
    }
  }, [onSelected]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">{t("tenant.loading")}</p>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("tenant.noWorkspaces")}</h2>
          <p className="text-sm text-slate-500">{t("tenant.noWorkspacesDesc")}</p>
          {regRequests.length > 0 ? (
            <div className="mt-6 border-t border-slate-200 pt-4 text-left">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("tenant.pendingRegsHeading")}
              </p>
              <ul className="space-y-2">
                {regRequests.map((r) => (
                  <li key={r.id} className="text-sm text-slate-600">
                    {r.status === "PENDING"
                      ? t("tenant.pendingRegsPending", { team: r.teamName, slug: r.slug })
                      : r.status === "APPROVED"
                        ? t("tenant.pendingRegsApprovedNoTenant", { team: r.teamName, slug: r.slug })
                        : r.status === "REJECTED"
                          ? t("tenant.pendingRegsRejected", { team: r.teamName, slug: r.slug })
                          : `${r.teamName} (/t/${r.slug}) — ${r.status}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center gap-3">
          <img src="/logo.svg" alt="Tymio" className="h-8" />
          <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
        </div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">{t("tenant.selectWorkspace")}</h2>
        <p className="mb-4 text-sm text-slate-500">{t("tenant.selectWorkspaceDesc")}</p>
        {error && (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <div className="grid gap-2">
          {memberships.map((m) => (
            <button
              key={m.tenant.id}
              onClick={() => handleSelect(m.tenant)}
              disabled={switching !== null}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-sky-300 hover:bg-sky-50/50 disabled:opacity-50 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{m.tenant.name}</p>
                <p className="text-xs text-slate-400">{m.tenant.slug} &middot; {m.role}</p>
              </div>
              {switching === m.tenant.id && (
                <span className="text-xs text-sky-600">{t("tenant.switching")}</span>
              )}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { UserRole } from "../types/models";

const DEV_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER"];

type Props = {
  onAuthenticated: () => void;
  /** Workspace slug from the URL path `/t/:slug` (must be passed from App — there is no `<Route path="/t/:slug">`, so `useParams()` would always be empty). */
  workspaceSlug: string;
};

export function TenantSlugLoginPage({ onAuthenticated, workspaceSlug }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [tenantInfo, setTenantInfo] = useState<{ name: string; slug: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const showDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
  const [devRole, setDevRole] = useState<UserRole>("EDITOR");
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const authError = searchParams.get("error");

  useEffect(() => {
    if (!workspaceSlug.trim()) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    async function resolve() {
      try {
        const info = await api.getTenantBySlug(workspaceSlug.trim());
        if (!cancelled) {
          setTenantInfo(info);
          setNotFound(false);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void resolve();
    return () => { cancelled = true; };
  }, [workspaceSlug]);

  const handleGoogleLogin = useCallback(() => {
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    window.location.href = `${base}/api/auth/google?tenantSlug=${encodeURIComponent(workspaceSlug.trim())}`;
  }, [workspaceSlug]);

  const handleDevLogin = useCallback(async () => {
    if (!workspaceSlug.trim()) return;
    try {
      setDevLoading(true);
      setDevError(null);
      await api.devLogin(devRole, undefined, workspaceSlug.trim());
      onAuthenticated();
    } catch (err) {
      setDevError((err as Error).message);
    } finally {
      setDevLoading(false);
    }
  }, [workspaceSlug, devRole, onAuthenticated]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" data-testid="tenant-slug-loading">
        <p className="text-sm text-slate-500">{t("app.loadingWorkspace")}</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center" data-testid="tenant-slug-not-found">
          <div className="mb-4 flex items-center justify-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("tenantSlug.notFound")}</h2>
          <p className="mb-4 text-sm text-slate-500">{t("tenantSlug.notFoundDesc")}</p>
          <Button variant="secondary" onClick={() => (window.location.href = "/")}>
            {t("tenantSlug.goHome")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md p-6" data-testid="tenant-slug-signin">
        <div className="mb-4 flex items-center gap-3">
          <img src="/logo.svg" alt="Tymio" className="h-8" />
          <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
        </div>

        <div className="mb-5 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-600">{t("tenantSlug.workspace")}</p>
          <p className="text-lg font-bold text-slate-800">{tenantInfo?.name}</p>
          <p className="font-mono text-xs text-slate-400">{tenantInfo?.slug}</p>
        </div>

        <p className="mb-4 text-sm text-slate-600">{t("tenantSlug.signInTo", { name: tenantInfo?.name })}</p>

        {authError && (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {authError === "login_denied" ? t("app.loginDenied") : t("app.loginFailed")}
          </p>
        )}

        <div className="grid gap-2">
          <Button onClick={handleGoogleLogin}>{t("app.continueGoogle")}</Button>

          {showDevLogin && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Developer Login</p>
              <label className="mb-2 grid gap-1">
                <span className="text-xs text-slate-500">Role</span>
                <select
                  value={devRole}
                  onChange={(e) => setDevRole(e.target.value as UserRole)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                >
                  {DEV_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <Button
                className="w-full"
                variant="secondary"
                disabled={devLoading}
                onClick={handleDevLogin}
              >
                {devLoading ? "Signing in..." : `Dev Login to ${tenantInfo?.name}`}
              </Button>
              {devError && <p className="mt-1 text-xs text-red-600">{devError}</p>}
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-slate-400 hover:text-slate-600">{t("tenantSlug.differentWorkspace")}</a>
        </div>
      </Card>
    </div>
  );
}

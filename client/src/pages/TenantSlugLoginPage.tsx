import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { clearPostAuthWorkspaceSlug, rememberPostAuthWorkspaceSlug } from "../lib/postAuthWorkspaceSlug";
import { AgentMcpCliHiddenGuidance } from "../components/agent/AgentMcpCliHiddenGuidance";
import { LegalFooterLinks } from "../components/legal/LegalFooterLinks";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { UserRole } from "../types/models";

const DEV_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER"];

type Props = {
  onAuthenticated: () => void;
  /** Workspace slug from the URL path `/t/:slug` (must be passed from App — there is no `<Route path="/t/:slug">`, so `useParams()` would always be empty). */
  workspaceSlug: string;
};

type Gate =
  | { kind: "loading" }
  | { kind: "signin"; tenant: { name: string; slug: string } }
  | { kind: "not-found" }
  | { kind: "pending-registration"; teamName: string; slug: string }
  | { kind: "rejected"; teamName: string; slug: string; reviewNote: string | null }
  | { kind: "provisioning"; teamName: string; slug: string };

export function TenantSlugLoginPage({ onAuthenticated, workspaceSlug }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [gate, setGate] = useState<Gate>({ kind: "loading" });

  const showDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
  const [devRole, setDevRole] = useState<UserRole>("EDITOR");
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSending, setMagicSending] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicErr, setMagicErr] = useState<string | null>(null);

  const authError = searchParams.get("error");
  const slugTrim = workspaceSlug.trim();

  useEffect(() => {
    if (!slugTrim) {
      setGate({ kind: "not-found" });
      return;
    }
    let cancelled = false;
    setGate({ kind: "loading" });

    async function resolve() {
      try {
        const info = await api.getTenantBySlug(slugTrim);
        if (!cancelled) {
          setGate({ kind: "signin", tenant: { name: info.name, slug: info.slug } });
        }
        return;
      } catch {
        /* fall through to registration / provisioning context */
      }

      try {
        const ctx = await api.lookupTenantSlugContext(slugTrim);
        if (cancelled) return;

        if (ctx.activeTenantBySlug) {
          setGate({
            kind: "signin",
            tenant: { name: ctx.activeTenantBySlug.name, slug: ctx.activeTenantBySlug.slug },
          });
          return;
        }

        const reg = ctx.registrationRequest;
        if (reg?.status === "PENDING") {
          setGate({ kind: "pending-registration", teamName: reg.teamName, slug: reg.slug });
          return;
        }
        if (reg?.status === "REJECTED") {
          setGate({
            kind: "rejected",
            teamName: reg.teamName,
            slug: reg.slug,
            reviewNote: reg.reviewNote,
          });
          return;
        }
        if (reg?.status === "APPROVED") {
          const st = ctx.linkedTenant?.status;
          if (st && st !== "ACTIVE") {
            setGate({ kind: "provisioning", teamName: reg.teamName, slug: reg.slug });
            return;
          }
        }
      } catch {
        /* not found */
      }

      if (!cancelled) setGate({ kind: "not-found" });
    }

    void resolve();
    return () => { cancelled = true; };
  }, [slugTrim]);

  const handleGoogleLogin = useCallback(() => {
    rememberPostAuthWorkspaceSlug(slugTrim);
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    window.location.href = `${base}/api/auth/google?tenantSlug=${encodeURIComponent(slugTrim)}`;
  }, [slugTrim]);

  const handleMicrosoftLogin = useCallback(() => {
    rememberPostAuthWorkspaceSlug(slugTrim);
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    window.location.href = `${base}/api/auth/microsoft?tenantSlug=${encodeURIComponent(slugTrim)}`;
  }, [slugTrim]);

  const handleMagicLinkSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setMagicErr(null);
      const em = magicEmail.trim();
      if (!em) return;
      setMagicSending(true);
      try {
        await api.requestMagicLink(em);
        setMagicSent(true);
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        if (status === 503) {
          setMagicErr(t("app.magicLinkUnavailable"));
        } else {
          setMagicErr(t("app.magicLinkError"));
        }
      } finally {
        setMagicSending(false);
      }
    },
    [magicEmail, t]
  );

  const handleDevLogin = useCallback(async () => {
    if (!slugTrim) return;
    try {
      setDevLoading(true);
      setDevError(null);
      await api.devLogin(devRole, undefined, slugTrim);
      onAuthenticated();
    } catch (err) {
      setDevError((err as Error).message);
    } finally {
      setDevLoading(false);
    }
  }, [slugTrim, devRole, onAuthenticated]);

  if (gate.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" data-testid="tenant-slug-loading">
        <p className="text-sm text-slate-500">{t("app.loadingWorkspace")}</p>
        <AgentMcpCliHiddenGuidance />
      </div>
    );
  }

  if (gate.kind === "not-found") {
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
          <Button
            variant="secondary"
            onClick={() => {
              clearPostAuthWorkspaceSlug();
              window.location.href = "/";
            }}
          >
            {t("tenantSlug.goHome")}
          </Button>
        </Card>
        <AgentMcpCliHiddenGuidance />
      </div>
    );
  }

  if (gate.kind === "pending-registration") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center" data-testid="tenant-slug-pending-registration">
          <div className="mb-4 flex items-center justify-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("tenantSlug.registrationPendingTitle")}</h2>
          <p className="mb-1 text-sm text-slate-600">
            {t("tenantSlug.registrationPendingBody", { workspaceName: gate.teamName, slug: gate.slug })}
          </p>
          <p className="mb-6 text-sm text-slate-500">{t("tenantSlug.registrationPendingFootnote")}</p>
          <div className="grid gap-2">
            <Button onClick={handleGoogleLogin}>{t("app.continueGoogle")}</Button>
            <Button variant="secondary" onClick={handleMicrosoftLogin}>
              {t("app.continueMicrosoft")}
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">{t("app.emailSignInDivider")}</p>
          {magicSent ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t("app.magicLinkSent")}</p>
          ) : (
            <form onSubmit={(e) => void handleMagicLinkSubmit(e)} className="grid gap-2">
              <input
                type="email"
                autoComplete="email"
                name="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder={t("app.emailPlaceholder")}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
              />
              <Button type="submit" variant="secondary" disabled={magicSending}>
                {magicSending ? "…" : t("app.sendMagicLink")}
              </Button>
              {magicErr ? <p className="text-sm text-red-600">{magicErr}</p> : null}
            </form>
          )}
          <div className="mt-4 text-center">
            <a
              href="/"
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => clearPostAuthWorkspaceSlug()}
            >
              {t("tenantSlug.differentWorkspace")}
            </a>
          </div>
        </Card>
        <AgentMcpCliHiddenGuidance />
      </div>
    );
  }

  if (gate.kind === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center" data-testid="tenant-slug-rejected">
          <div className="mb-4 flex items-center justify-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("tenantSlug.registrationRejectedTitle")}</h2>
          <p className="mb-2 text-sm text-slate-600">
            {t("tenantSlug.registrationRejectedBody", { workspaceName: gate.teamName, slug: gate.slug })}
          </p>
          {gate.reviewNote ? (
            <p className="mb-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-600">
              {gate.reviewNote}
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-500">{t("tenantSlug.registrationRejectedNoNote")}</p>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              clearPostAuthWorkspaceSlug();
              window.location.href = "/";
            }}
          >
            {t("tenantSlug.goHome")}
          </Button>
        </Card>
        <AgentMcpCliHiddenGuidance />
      </div>
    );
  }

  if (gate.kind === "provisioning") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center" data-testid="tenant-slug-provisioning">
          <div className="mb-4 flex items-center justify-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("tenantSlug.provisioningTitle")}</h2>
          <p className="mb-6 text-sm text-slate-600">
            {t("tenantSlug.provisioningBody", { workspaceName: gate.teamName, slug: gate.slug })}
          </p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {t("tenantSlug.provisioningRetry")}
          </Button>
          <div className="mt-4 text-center">
            <a
              href="/"
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => clearPostAuthWorkspaceSlug()}
            >
              {t("tenantSlug.goHome")}
            </a>
          </div>
        </Card>
        <AgentMcpCliHiddenGuidance />
      </div>
    );
  }

  const tenantInfo = gate.tenant;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md p-6" data-testid="tenant-slug-signin">
        <div className="mb-4 flex items-center gap-3">
          <img src="/logo.svg" alt="Tymio" className="h-8" />
          <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
        </div>

        <div className="mb-5 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-600">{t("tenantSlug.workspace")}</p>
          <p className="text-lg font-bold text-slate-800">{tenantInfo.name}</p>
          <p className="font-mono text-xs text-slate-400">{tenantInfo.slug}</p>
        </div>

        <p className="mb-4 text-sm text-slate-600">{t("tenantSlug.signInTo", { name: tenantInfo.name })}</p>

        {authError && (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {authError === "login_denied" ? t("app.loginDenied") : t("app.loginFailed")}
          </p>
        )}

        <div className="grid gap-2">
          <Button onClick={handleGoogleLogin}>{t("app.continueGoogle")}</Button>
          <Button variant="secondary" onClick={handleMicrosoftLogin}>
            {t("app.continueMicrosoft")}
          </Button>
          <p className="mt-2 text-center text-xs text-slate-400">{t("app.emailSignInDivider")}</p>
          {magicSent ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t("app.magicLinkSent")}</p>
          ) : (
            <form onSubmit={(e) => void handleMagicLinkSubmit(e)} className="grid gap-2">
              <input
                type="email"
                autoComplete="email"
                name="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder={t("app.emailPlaceholder")}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
              />
              <Button type="submit" variant="secondary" disabled={magicSending}>
                {magicSending ? "…" : t("app.sendMagicLink")}
              </Button>
              {magicErr ? <p className="text-sm text-red-600">{magicErr}</p> : null}
            </form>
          )}

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
                {devLoading ? "Signing in..." : `Dev Login to ${tenantInfo.name}`}
              </Button>
              {devError && <p className="mt-1 text-xs text-red-600">{devError}</p>}
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <a
            href="/"
            className="text-xs text-slate-400 hover:text-slate-600"
            onClick={() => clearPostAuthWorkspaceSlug()}
          >
            {t("tenantSlug.differentWorkspace")}
          </a>
        </div>
      </Card>
      <LegalFooterLinks className="mt-6 text-center text-xs text-slate-400" />
      <AgentMcpCliHiddenGuidance />
    </div>
  );
}

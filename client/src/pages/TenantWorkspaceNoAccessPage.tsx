import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { api } from "../lib/api";

type Props = {
  workspaceName: string;
  workspaceSlug: string;
  userEmail: string;
  isPlatformPending: boolean;
  onContinue: () => void;
};

/**
 * Shown when the user opened `/t/:slug`, signed in, the workspace exists (ACTIVE),
 * but they have no `TenantMembership` yet (not invited / not added).
 */
export function TenantWorkspaceNoAccessPage({
  workspaceName,
  workspaceSlug,
  userEmail,
  isPlatformPending,
  onContinue,
}: Props) {
  const { t } = useTranslation();
  const [accessPending, setAccessPending] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successHint, setSuccessHint] = useState<"new" | "repeat" | null>(null);
  const [adminsNotified, setAdminsNotified] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    setError(null);
    setSuccessHint(null);
    setAdminsNotified(null);
    void api
      .getMyWorkspaceAccessRequest(workspaceSlug)
      .then((r) => {
        if (!cancelled) setAccessPending(r.pending);
      })
      .catch(() => {
        if (!cancelled) setAccessPending(false);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  const handleRequestAccess = useCallback(async () => {
    setError(null);
    setSuccessHint(null);
    setAdminsNotified(null);
    setSubmitting(true);
    try {
      const res = await api.submitWorkspaceAccessRequest(workspaceSlug);
      setAccessPending(res.pending);
      setAdminsNotified(res.adminsNotified);
      setSuccessHint(res.alreadyRequested ? "repeat" : "new");
    } catch (e) {
      const err = e as Error & { body?: { error?: string } };
      setError(err.body?.error ?? err.message ?? t("tenantSlug.membershipRequestError"));
    } finally {
      setSubmitting(false);
    }
  }, [workspaceSlug, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md p-6 text-center" data-testid="tenant-workspace-no-access">
        <div className="mb-4 flex items-center justify-center gap-3">
          <img src="/logo.svg" alt="Tymio" className="h-8" />
          <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
        </div>
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <svg className="h-8 w-8 text-sky-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("tenantSlug.membershipPendingTitle")}</h2>
        <p className="mb-3 text-sm text-slate-600">
          <Trans
            i18nKey="tenantSlug.membershipPendingLead"
            values={{ email: userEmail }}
            components={{ 1: <strong className="font-semibold text-slate-800" /> }}
          />
        </p>
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("tenantSlug.workspace")}</p>
          <p className="text-base font-semibold text-slate-800">{workspaceName}</p>
          <p className="font-mono text-xs text-slate-500">/t/{workspaceSlug}</p>
        </div>
        <p className="mb-4 text-sm text-slate-600">{t("tenantSlug.membershipPendingBody")}</p>
        {isPlatformPending ? (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("tenantSlug.membershipPendingAlsoPlatform")}
          </p>
        ) : null}

        {error ? (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        {successHint === "new" ? (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {adminsNotified
              ? t("tenantSlug.membershipRequestSuccessNotified")
              : t("tenantSlug.membershipRequestSuccessQuiet")}
          </p>
        ) : null}
        {successHint === "repeat" ? (
          <p className="mb-3 rounded border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {t("tenantSlug.membershipRequestAlready")}
          </p>
        ) : null}

        <div className="mb-3 flex flex-col gap-2">
          {accessPending && !statusLoading && !successHint ? (
            <p className="text-sm font-medium text-slate-600">{t("tenantSlug.membershipRequestPending")}</p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            data-testid="workspace-access-request"
            disabled={statusLoading || submitting || accessPending}
            onClick={handleRequestAccess}
          >
            {submitting ? t("tenantSlug.membershipRequestSubmitting") : t("tenantSlug.membershipRequestAccess")}
          </Button>
        </div>

        <Button className="w-full" onClick={onContinue}>
          {t("tenantSlug.membershipPendingContinue")}
        </Button>
      </Card>
    </div>
  );
}

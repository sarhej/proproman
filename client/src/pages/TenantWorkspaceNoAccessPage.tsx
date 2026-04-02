import { Trans, useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

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
        <Button className="w-full" onClick={onContinue}>
          {t("tenantSlug.membershipPendingContinue")}
        </Button>
      </Card>
    </div>
  );
}

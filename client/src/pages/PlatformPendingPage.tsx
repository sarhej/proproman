import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { SeoHead } from "../components/seo/SeoHead";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { suggestSlugFromEmailDomain } from "../lib/workspaceSlugFromEmail";

const SLUG_PATTERN = /^[a-z0-9-]{2,50}$/;

export type SlugRegistrationHint =
  | { kind: "PENDING" | "APPROVED_NO_ACCESS"; slug: string; teamName: string }
  | null;

type PendingReg = { id: string; teamName: string; slug: string; status: string };

type Props = {
  userEmail: string;
  slugRegistrationHint: SlugRegistrationHint;
  pendingUserWorkspaceRegs: PendingReg[];
  onSignOut: () => void;
  onNavigateToWorkspace: (slug: string) => void;
  onRequestNewWorkspace: () => void;
};

export function PlatformPendingPage({
  userEmail,
  slugRegistrationHint,
  pendingUserWorkspaceRegs,
  onSignOut,
  onNavigateToWorkspace,
  onRequestNewWorkspace,
}: Props) {
  const { t } = useTranslation();
  const [slugDraft, setSlugDraft] = useState(() => suggestSlugFromEmailDomain(userEmail) ?? "");
  const [slugErr, setSlugErr] = useState<string | null>(null);

  function handleOpenWorkspace(e: React.FormEvent) {
    e.preventDefault();
    const norm = slugDraft.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!SLUG_PATTERN.test(norm)) {
      setSlugErr(t("app.pendingSlugInvalid"));
      return;
    }
    setSlugErr(null);
    onNavigateToWorkspace(norm);
  }

  return (
    <>
      <SeoHead
        title={t("seo.pendingTitle")}
        description={t("seo.pendingDescription")}
        canonicalPath="/"
        robots="noindex,nofollow"
      />
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md p-6 text-center">
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
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("app.pendingTitle")}</h2>
        <p className="mb-1 text-sm text-slate-600">
          <Trans
            i18nKey="app.pendingMsg"
            values={{ email: userEmail }}
            components={{ 1: <strong className="font-semibold text-slate-800" /> }}
          />
        </p>
        <p className="mb-4 text-left text-sm text-slate-600">{t("app.pendingDesc")}</p>

        <form onSubmit={handleOpenWorkspace} className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("app.pendingHaveSlugTitle")}</p>
          <label className="mb-1 grid gap-1">
            <span className="text-sm font-medium text-slate-700">{t("app.pendingSlugLabel")}</span>
            <input
              type="text"
              value={slugDraft}
              onChange={(e) => {
                setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSlugErr(null);
              }}
              placeholder={t("app.pendingSlugPlaceholder")}
              className="rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="mb-2 text-xs text-slate-500">{t("app.pendingSlugHelp")}</p>
          {slugErr ? <p className="mb-2 text-sm text-red-600">{slugErr}</p> : null}
          <Button type="submit" className="w-full">
            {t("app.pendingOpenWorkspace")}
          </Button>
        </form>

        <div className="mb-4 text-left">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("app.pendingNeedWorkspaceTitle")}</p>
          <Button type="button" variant="secondary" className="w-full" onClick={onRequestNewWorkspace}>
            {t("app.pendingRequestWorkspace")}
          </Button>
        </div>

        {(slugRegistrationHint || pendingUserWorkspaceRegs.some((r) => r.status === "PENDING")) && (
          <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
              {t("app.pendingWorkspaceRegTitle")}
            </p>
            {slugRegistrationHint?.kind === "PENDING" ? (
              <p className="text-sm text-slate-700">
                {t("app.pendingWorkspaceRegLine", {
                  workspaceName: slugRegistrationHint.teamName,
                  slug: slugRegistrationHint.slug,
                })}
              </p>
            ) : null}
            {slugRegistrationHint?.kind === "APPROVED_NO_ACCESS" ? (
              <p className="text-sm text-slate-700">
                {t("tenant.pendingRegsApprovedNoTenant", {
                  workspaceName: slugRegistrationHint.teamName,
                  slug: slugRegistrationHint.slug,
                })}
              </p>
            ) : null}
            {pendingUserWorkspaceRegs
              .filter((r) => r.status === "PENDING")
              .filter(
                (r) =>
                  !slugRegistrationHint ||
                  r.slug.toLowerCase() !== slugRegistrationHint.slug.toLowerCase()
              )
              .map((r) => (
                <p key={r.id} className="text-sm text-slate-700">
                  {t("app.pendingWorkspaceRegLine", { workspaceName: r.teamName, slug: r.slug })}
                </p>
              ))}
            <p className="mt-2 text-xs text-slate-500">{t("app.pendingWorkspaceRegFootnote")}</p>
          </div>
        )}

        <p className="mb-4 text-left text-xs text-slate-500">{t("app.pendingPlatformNote")}</p>

        <Button
          variant="secondary"
          onClick={() => {
            void onSignOut();
          }}
        >
          {t("app.signOut")}
        </Button>
      </Card>
    </div>
    </>
  );
}

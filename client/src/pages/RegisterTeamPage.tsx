import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SeoHead } from "../components/seo/SeoHead";
import { LegalFooterLinks } from "../components/legal/LegalFooterLinks";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { api } from "../lib/api";
import { generateWorkspaceSlugFromTeamName } from "../lib/workspaceRegistration";
import { parseInviteEmailsFromText } from "../lib/parseInviteEmails";
import { suggestSlugFromEmailDomain } from "../lib/workspaceSlugFromEmail";

export type RegisterTeamPageProps = {
  onBack: () => void;
  /** Logged-in user: prefill contact fields (e.g. platform PENDING flow). */
  prefilledContact?: { email: string; name: string };
  /** i18n key for back navigation (default: register.backToHome). */
  backLabelKey?: string;
  /** When server auto-provisions the workspace (AUTO_APPROVE), navigate without manual review. */
  onWorkspaceProvisioned?: (slug: string) => void | Promise<void>;
};

function normalizeUiLocale(i18nLanguage: string): string | undefined {
  const base = i18nLanguage.split("-")[0]?.toLowerCase() ?? "en";
  if (["en", "cs", "sk", "pl", "uk"].includes(base)) return base;
  return undefined;
}

export function RegisterTeamPage({ onBack, prefilledContact, backLabelKey, onWorkspaceProvisioned }: RegisterTeamPageProps) {
  const { t, i18n } = useTranslation();
  const backLabel = t(backLabelKey ?? "register.backToHome");
  const domainSuggestion = prefilledContact?.email ? suggestSlugFromEmailDomain(prefilledContact.email) : null;
  const autoSlugRef = useRef<"name" | "domain" | "manual">(domainSuggestion ? "domain" : "name");

  const [teamName, setTeamName] = useState("");
  const [slug, setSlug] = useState(() => domainSuggestion ?? "");
  const [contactName, setContactName] = useState(prefilledContact?.name ?? "");
  const [contactEmail, setContactEmail] = useState(prefilledContact?.email ?? "");
  const [message, setMessage] = useState("");
  const [inviteEmailsRaw, setInviteEmailsRaw] = useState("");
  const [trustCompanyDomain, setTrustCompanyDomain] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /** When the server auto-provisioned the workspace but the host did not supply onWorkspaceProvisioned (e.g. signed-out /register-workspace). */
  const [autoProvisionedSlug, setAutoProvisionedSlug] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [submitEmailMeta, setSubmitEmailMeta] = useState<{
    adminsNotifiedOnSubmit: boolean;
    decisionEmailsConfigured: boolean;
  }>({ adminsNotifiedOnSubmit: false, decisionEmailsConfigured: false });

  const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
  const returnToParam = encodeURIComponent("/register-workspace");
  const canTrustDomain = Boolean(suggestSlugFromEmailDomain(contactEmail.trim()));

  function handleTeamNameChange(value: string) {
    setTeamName(value);
    if (autoSlugRef.current === "manual") return;
    setSlug(generateWorkspaceSlugFromTeamName(value));
    autoSlugRef.current = "name";
  }

  function handleSlugChange(value: string) {
    autoSlugRef.current = "manual";
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  function handleContactEmailChange(value: string) {
    setContactEmail(value);
    if (autoSlugRef.current === "manual") return;
    const d = suggestSlugFromEmailDomain(value.trim());
    if (d) {
      setSlug(d);
      autoSlugRef.current = "domain";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const locale = normalizeUiLocale(i18n.language);
      const inviteEmails = parseInviteEmailsFromText(inviteEmailsRaw);
      const ce = contactEmail.trim();
      const filteredInvites = inviteEmails.filter((e) => e.toLowerCase() !== ce.toLowerCase());
      const res = await api.submitTenantRequest({
        teamName: teamName.trim(),
        slug: slug.trim(),
        contactName: contactName.trim(),
        contactEmail: ce,
        message: message.trim() || undefined,
        inviteEmails: filteredInvites.length > 0 ? filteredInvites : undefined,
        trustCompanyDomain: trustCompanyDomain && canTrustDomain ? true : undefined,
        ...(locale ? { locale } : {}),
      });
      const provisionedSlug = res.tenant?.slug;
      if (res.status === "APPROVED" && provisionedSlug) {
        if (onWorkspaceProvisioned) {
          await onWorkspaceProvisioned(provisionedSlug);
          return;
        }
        setAutoProvisionedSlug(provisionedSlug);
        setSubmittedRequestId(res.id);
        setSubmitted(true);
        return;
      }
      setAutoProvisionedSlug(null);
      const n = res.emailNotifications;
      setSubmitEmailMeta({
        adminsNotifiedOnSubmit: n?.adminsNotifiedOnSubmit === true,
        decisionEmailsConfigured: n?.decisionEmailsConfigured === true,
      });
      setSubmittedRequestId(res.id);
      setSubmitted(true);
    } catch (err) {
      const apiErr = err as Error & { status?: number; body?: { error?: string } };
      if (apiErr.status === 409) {
        setError(t("register.errorSlugTaken"));
      } else {
        setError(apiErr.body?.error ?? apiErr.message ?? t("register.errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canonicalRegister = "/register-workspace";

  if (submitted) {
    return (
      <>
        <SeoHead
          title={t("seo.registerTitle")}
          description={t("seo.registerDescription")}
          canonicalPath={canonicalRegister}
          robots={prefilledContact ? "noindex,nofollow" : "index,follow"}
        />
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Card className="max-w-md p-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-800">
              {autoProvisionedSlug ? t("register.successAutoApprovedTitle") : t("register.successTitle")}
            </h2>
            <div className="mb-6 space-y-2 text-sm text-slate-600">
              {autoProvisionedSlug ? (
                <>
                  <p>{t("register.successAutoApprovedLead", { slug: autoProvisionedSlug })}</p>
                  <p>{t("register.successAutoApprovedSignIn", { email: contactEmail })}</p>
                  <p>
                    <a
                      className="font-medium text-sky-700 underline hover:text-sky-900"
                      href={`${publicOrigin}/t/${encodeURIComponent(autoProvisionedSlug)}`}
                    >
                      {t("register.successAutoApprovedOpenLink", { slug: autoProvisionedSlug })}
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <p>{t("register.successLead")}</p>
                  {submitEmailMeta.adminsNotifiedOnSubmit ? <p>{t("register.successAdminsEmailed")}</p> : null}
                  {submitEmailMeta.decisionEmailsConfigured ? (
                    <p>{t("register.successDecisionEmailPromise", { email: contactEmail })}</p>
                  ) : (
                    <p>{t("register.successNoDecisionEmailPromise")}</p>
                  )}
                </>
              )}
              {submittedRequestId ? (
                <p className="font-mono text-xs text-slate-500">{t("register.successRequestId", { id: submittedRequestId })}</p>
              ) : null}
            </div>
            <Button variant="secondary" onClick={onBack}>
              {backLabel}
            </Button>
            <LegalFooterLinks className="mt-6 text-center text-xs text-slate-400" />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <SeoHead
        title={t("seo.registerTitle")}
        description={t("seo.registerDescription")}
        canonicalPath={canonicalRegister}
        robots={prefilledContact ? "noindex,nofollow" : "index,follow"}
      />
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-lg p-6">
          <div className="mb-5">
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              {backLabel}
            </button>
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="Tymio" className="h-8" />
              <div>
                <h1 className="text-lg font-semibold text-slate-800">{t("register.title")}</h1>
                <p className="text-sm text-slate-500">{t("register.subtitle")}</p>
              </div>
            </div>
          </div>

          {!prefilledContact ? (
            <div className="mb-4 grid gap-2">
              <p className="text-xs text-slate-500">{t("register.oauthIntro")}</p>
              <Button
                type="button"
                onClick={() => {
                  window.location.href = `${apiBase}/api/auth/google?returnTo=${returnToParam}`;
                }}
              >
                {t("app.continueGoogle")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  window.location.href = `${apiBase}/api/auth/microsoft?returnTo=${returnToParam}`;
                }}
              >
                {t("app.continueMicrosoft")}
              </Button>
              <p className="mt-1 text-center text-xs text-slate-400">{t("app.emailSignInDivider")}</p>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-700">{t("register.workspaceName")}</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={teamName}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                placeholder={t("register.workspaceNamePlaceholder")}
                className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-slate-700">{t("register.slug")}</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={50}
                pattern="^[a-z0-9\-]+$"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder={t("register.slugPlaceholder")}
                className="rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <span className="text-xs text-slate-400">{t("register.slugHelp")}</span>
              {slug ? (
                <span className="text-xs text-sky-700">
                  {t("register.urlPreview")}: {publicOrigin}/t/{slug}
                </span>
              ) : null}
            </label>

            {prefilledContact ? (
              <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                <label className="grid gap-1">
                  <span className="font-medium text-slate-700">{t("register.contactName")}</span>
                  <input
                    type="text"
                    required
                    minLength={1}
                    maxLength={100}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <p className="text-slate-600">
                  <span className="font-medium text-slate-700">{t("register.contactEmail")}:</span> {contactEmail}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium text-slate-700">{t("register.contactName")}</span>
                  <input
                    type="text"
                    required
                    minLength={1}
                    maxLength={100}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder={t("register.contactNamePlaceholder")}
                    className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium text-slate-700">{t("register.contactEmail")}</span>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => handleContactEmailChange(e.target.value)}
                    placeholder={t("register.contactEmailPlaceholder")}
                    className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </label>
              </div>
            )}

            <div className="border-t border-slate-200 pt-2">
              <button
                type="button"
                className="text-sm font-medium text-sky-700 hover:text-sky-900"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "− " : "+ "}
                {t("register.advancedToggle")}
              </button>
              {showAdvanced ? (
                <div className="mt-3 grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">{t("register.message")}</span>
                    <textarea
                      maxLength={1000}
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t("register.messagePlaceholder")}
                      className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium text-slate-700">{t("register.inviteEmails")}</span>
                    <textarea
                      maxLength={4000}
                      rows={3}
                      value={inviteEmailsRaw}
                      onChange={(e) => setInviteEmailsRaw(e.target.value)}
                      placeholder={t("register.inviteEmailsPlaceholder")}
                      className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <span className="text-xs text-slate-400">{t("register.inviteEmailsHelp")}</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={trustCompanyDomain && canTrustDomain}
                      disabled={!canTrustDomain}
                      onChange={(e) => setTrustCompanyDomain(e.target.checked)}
                    />
                    <span>{t("register.trustDomain")}</span>
                  </label>
                </div>
              ) : null}
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? t("register.submitting") : t("register.submit")}
            </Button>
          </form>
        </Card>
        <LegalFooterLinks className="mt-6 text-center text-xs text-slate-400" />
      </div>
    </>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LegalFooterLinks } from "../components/legal/LegalFooterLinks";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { api } from "../lib/api";
import { generateWorkspaceSlugFromTeamName } from "../lib/workspaceRegistration";

type Props = {
  onBack: () => void;
};

export function RegisterTeamPage({ onBack }: Props) {
  const { t } = useTranslation();
  const [teamName, setTeamName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.submitTenantRequest({
        teamName: teamName.trim(),
        slug: slug.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        message: message.trim() || undefined,
      });
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

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("register.successTitle")}</h2>
          <p className="mb-6 text-sm text-slate-600">
            {t("register.successDesc", { email: contactEmail })}
          </p>
          <Button variant="secondary" onClick={onBack}>
            {t("register.backToHome")}
          </Button>
          <LegalFooterLinks className="mt-6 text-center text-xs text-slate-400" />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-5">
          <button
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {t("register.backToHome")}
          </button>
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <div>
              <h1 className="text-lg font-semibold text-slate-800">{t("register.title")}</h1>
              <p className="text-sm text-slate-500">{t("register.subtitle")}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-slate-700">{t("register.workspaceName")}</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={teamName}
              onChange={(e) => {
                setTeamName(e.target.value);
                if (!slug || slug === generateWorkspaceSlugFromTeamName(teamName)) {
                  setSlug(generateWorkspaceSlugFromTeamName(e.target.value));
                }
              }}
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
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder={t("register.slugPlaceholder")}
              className="rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-xs text-slate-400">{t("register.slugHelp")}</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
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
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder={t("register.contactEmailPlaceholder")}
                className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
          </div>

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

          <Button type="submit" disabled={submitting}>
            {submitting ? t("register.submitting") : t("register.submit")}
          </Button>
        </form>
      </Card>
      <LegalFooterLinks className="mt-6 text-center text-xs text-slate-400" />
    </div>
  );
}

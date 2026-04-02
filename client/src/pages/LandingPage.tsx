import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";

type Props = {
  onSignIn: () => void;
  onRegister: () => void;
};

export function LandingPage({ onSignIn, onRegister }: Props) {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 via-white to-sky-50/40 p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgb(14 165 233 / 0.18), transparent),
            radial-gradient(ellipse 60% 40% at 100% 50%, rgb(99 102 241 / 0.08), transparent),
            radial-gradient(ellipse 50% 30% at 0% 80%, rgb(14 165 233 / 0.1), transparent)`,
        }}
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 text-center">
          <img src="/logo.svg" alt="Tymio" className="mx-auto mb-4 h-12 drop-shadow-sm" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("landing.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("landing.subtitle")}</p>
        </div>
        <div className="grid gap-4">
          <Card className="cursor-pointer border-slate-200/80 bg-white/90 p-5 shadow-md shadow-slate-900/[0.04] backdrop-blur-sm transition-shadow hover:shadow-lg" onClick={onSignIn}>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-800">{t("landing.signIn")}</h2>
                <p className="text-sm text-slate-500">{t("landing.signInDesc")}</p>
              </div>
              <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Card>
          <Card className="cursor-pointer border-slate-200/80 bg-white/90 p-5 shadow-md shadow-slate-900/[0.04] backdrop-blur-sm transition-shadow hover:shadow-lg" onClick={onRegister}>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-800">{t("landing.registerTeam")}</h2>
                <p className="text-sm text-slate-500">{t("landing.registerDesc")}</p>
              </div>
              <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

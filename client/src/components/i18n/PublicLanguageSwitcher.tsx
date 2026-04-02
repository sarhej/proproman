import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { APP_LOCALE_CODES, normalizeUiLanguageCode, type AppLocaleCode } from "../../lib/appLocales";

function persistLang(code: string) {
  try {
    localStorage.setItem("lang", code);
  } catch {
    /* ignore */
  }
}

type Props = {
  /** Fixed top-right (default) or flows in document for narrow layouts */
  variant?: "floating" | "inline";
  className?: string;
};

/**
 * Language picker for unauthenticated / public entry (landing, register, /t/…, sign-in).
 * Persists to `localStorage.lang` to match i18n init.
 */
export function PublicLanguageSwitcher({ variant = "floating", className = "" }: Props) {
  const { t, i18n } = useTranslation();
  const current = normalizeUiLanguageCode(i18n.language);

  const setLng = (code: AppLocaleCode) => {
    void i18n.changeLanguage(code);
    persistLang(code);
  };

  const position = variant === "floating" ? "fixed right-4 top-4 z-[100] sm:right-8 sm:top-8" : "";

  return (
    <div className={`${position} ${className}`.trim()}>
      <div
        className="flex max-w-[min(100vw-2rem,22rem)] flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-xl shadow-slate-900/[0.06] ring-1 ring-slate-900/[0.04] backdrop-blur-md"
        role="group"
        aria-label={t("landing.language")}
      >
        <div className="flex items-center gap-2 px-2 pt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
            <Languages size={16} strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t("landing.language")}</p>
            <p className="truncate text-xs text-slate-500">{t("landing.languageSubtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {APP_LOCALE_CODES.map((code) => {
            const active = current === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLng(code)}
                aria-pressed={active}
                className={`rounded-xl px-3 py-2 text-left transition ${
                  active
                    ? "bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="block text-sm font-semibold leading-tight">{t(`lang.${code}`)}</span>
                <span
                  className={`mt-0.5 block text-[10px] font-medium uppercase tracking-wider ${
                    active ? "text-white/85" : "text-slate-400"
                  }`}
                >
                  {code}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

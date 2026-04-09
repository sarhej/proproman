import { useTranslation } from "react-i18next";
import { legalPageHref } from "../../lib/legalPageHref";

type Props = {
  className?: string;
};

export function LegalFooterLinks({ className }: Props) {
  const { t } = useTranslation();
  return (
    <p className={className ?? "mt-8 text-center text-xs text-slate-400"}>
      <a href="/wiki" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">
        {t("landing.wikiDocs")}
      </a>
      <span className="mx-2 text-slate-300" aria-hidden>
        ·
      </span>
      <a href={legalPageHref("/legal/terms")} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">
        {t("landing.legalTerms")}
      </a>
      <span className="mx-2 text-slate-300" aria-hidden>
        ·
      </span>
      <a href={legalPageHref("/legal/privacy")} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600">
        {t("landing.legalPrivacy")}
      </a>
    </p>
  );
}

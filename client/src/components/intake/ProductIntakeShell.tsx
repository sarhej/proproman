import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { IntakeMode, IntakeSession } from "../../types/models";
import { AttachmentPanel } from "../attachments/AttachmentPanel";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";

export type ProductIntakeOpenArgs = {
  mode: IntakeMode;
  productId: string;
  productName: string;
};

type Props = {
  open: ProductIntakeOpenArgs | null;
  onClose: () => void;
};

const ANALYZE_DEBOUNCE_MS = 800;

export function ProductIntakeShell({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);
  const [manualFallback, setManualFallback] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setRawText("");
      setError(null);
      setAnalyzeMessage(null);
      setManualFallback(false);
      sessionIdRef.current = null;
      return;
    }

    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const { session: created } = await api.createIntakeSession({
          productId: open.productId,
          mode: open.mode
        });
        if (cancelled) return;
        setSession(created);
        sessionIdRef.current = created.id;
        setRawText(created.rawText ?? "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("intake.createFailed"));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!session?.id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void api.updateIntakeSession(session.id, { rawText }).catch(() => {
        /* non-blocking autosave */
      });
    }, ANALYZE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawText, session?.id]);

  if (!open) return null;

  const isBug = open.mode === "BUG";

  async function runAnalyze() {
    if (!session) return;
    setAnalyzing(true);
    setError(null);
    try {
      await api.updateIntakeSession(session.id, { rawText });
      const result = await api.analyzeIntakeSession(session.id);
      setSession(result.session);
      setAnalyzeMessage(result.analyze.message);
      if (result.analyze.stub) {
        setManualFallback(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("intake.analyzeFailed"));
      setManualFallback(true);
    } finally {
      setAnalyzing(false);
    }
  }

  async function abandonAndClose() {
    if (session?.id) {
      try {
        await api.updateIntakeSession(session.id, { status: "ABANDONED" });
      } catch {
        /* ignore */
      }
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
              isBug ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
            }`}
          >
            {isBug ? t("intake.modeBug") : t("intake.modeFeature")}
          </span>
          <h2 className="text-sm font-semibold text-slate-900">
            {isBug ? t("intake.createBugTitle") : t("intake.createFeatureTitle")}
            <span className="ml-2 font-normal text-slate-500">· {open.productName}</span>
          </h2>
          <button
            type="button"
            className="ml-auto text-xs text-slate-500 hover:text-slate-800"
            onClick={() => void abandonAndClose()}
          >
            {t("common.cancel")}
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {busy && !session ? (
            <p className="text-sm text-slate-500">{t("intake.starting")}</p>
          ) : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
          {analyzeMessage ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{analyzeMessage}</p>
          ) : null}

          <Textarea
            rows={5}
            value={rawText}
            disabled={!session || analyzing}
            placeholder={t("intake.composerPlaceholder")}
            onChange={(e) => setRawText(e.target.value)}
            onPaste={() => {
              /* analyze triggered after debounce save + user can hit Analyze */
            }}
          />

          {session ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {t("intake.attachments")}
              </p>
              <AttachmentPanel target={{ intakeSessionId: session.id }} />
            </div>
          ) : null}

          {manualFallback ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">{t("intake.manualFallbackTitle")}</p>
              <p className="text-xs text-slate-600">{t("intake.manualFallbackBody")}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" disabled={!session || analyzing} onClick={() => void runAnalyze()}>
            {analyzing ? t("intake.analyzing") : t("intake.analyze")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!session}
            onClick={() => setManualFallback(true)}
          >
            {t("intake.manualForm")}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void abandonAndClose()}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!session}
              onClick={() => {
                setManualFallback(true);
                setAnalyzeMessage(t("intake.continuePhase1Hint"));
              }}
            >
              {t("intake.continue")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type {
  BugDraft,
  CreationPlan,
  CreationPlanItem,
  IntakeDrafts,
  IntakeMode,
  IntakeSession
} from "../../types/models";
import { AttachmentPanel } from "../attachments/AttachmentPanel";
import { Button } from "../ui/Button";
import { Input, Select, Textarea } from "../ui/Field";

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

function asPlan(value: unknown): CreationPlan | null {
  if (!value || typeof value !== "object") return null;
  const p = value as CreationPlan;
  if (!Array.isArray(p.items) || p.items.length === 0) return null;
  return p;
}

function asDrafts(value: unknown): IntakeDrafts | null {
  if (!value || typeof value !== "object") return null;
  const d = value as IntakeDrafts;
  if (!Array.isArray(d.items) || d.items.length === 0) return null;
  return d;
}

function newItemKey(items: CreationPlanItem[]): string {
  const n = items.length + 1;
  return `item-${n}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ProductIntakeShell({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);
  const [manualFallback, setManualFallback] = useState(false);
  const [plan, setPlan] = useState<CreationPlan | null>(null);
  const [drafts, setDrafts] = useState<IntakeDrafts | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setRawText("");
      setError(null);
      setAnalyzeMessage(null);
      setManualFallback(false);
      setPlan(null);
      setDrafts(null);
      setSelectedKeys([]);
      setClarifyAnswers({});
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
      if (e.key !== "Escape") return;
      const id = sessionIdRef.current;
      if (id) {
        void api.updateIntakeSession(id, { status: "ABANDONED" }).catch(() => undefined);
      }
      onClose();
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
  const clarifying = session?.status === "CLARIFYING" || Boolean(plan?.needsClarification);
  const planReady =
    (session?.status === "PLAN_READY" ||
      session?.status === "REVIEWING" ||
      session?.status === "DRAFTING") &&
    plan &&
    !plan.needsClarification;
  const canGenerateDrafts = Boolean(isBug && planReady && !clarifying);

  function applyAnalyzeResult(result: {
    session: IntakeSession;
    analyze: {
      stub?: boolean;
      needsClarification: boolean;
      creationPlan: CreationPlan | null;
      message: string;
    };
  }) {
    setSession(result.session);
    setAnalyzeMessage(result.analyze.message);
    const nextPlan = asPlan(result.analyze.creationPlan ?? result.session.creationPlan);
    setPlan(nextPlan);
    setDrafts(null);
    setSelectedKeys([]);
    setClarifyAnswers({});
    if (result.analyze.stub || !nextPlan) {
      setManualFallback(true);
    } else {
      setManualFallback(false);
    }
  }

  async function runAnalyze() {
    if (!session) return;
    setAnalyzing(true);
    setError(null);
    try {
      await api.updateIntakeSession(session.id, { rawText });
      const result = await api.analyzeIntakeSession(session.id);
      applyAnalyzeResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("intake.analyzeFailed"));
      setManualFallback(true);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submitClarification() {
    if (!session) return;
    const answers = Object.fromEntries(
      Object.entries(clarifyAnswers).filter(([, v]) => v.trim().length > 0)
    );
    if (Object.keys(answers).length === 0) {
      setError(t("intake.clarifyRequired"));
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const result = await api.clarifyIntakeSession(session.id, answers);
      applyAnalyzeResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("intake.clarifyFailed"));
    } finally {
      setAnalyzing(false);
    }
  }

  async function persistPlan(next: CreationPlan) {
    if (!session) return;
    setPlan(next);
    setSavingPlan(true);
    setError(null);
    try {
      const { session: updated } = await api.updateIntakePlan(session.id, {
        ...next,
        needsClarification: false
      });
      setSession(updated);
      setPlan(asPlan(updated.creationPlan) ?? next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("intake.planSaveFailed"));
    } finally {
      setSavingPlan(false);
    }
  }

  async function runGenerateDrafts() {
    if (!session) return;
    if (!isBug) {
      setAnalyzeMessage(t("intake.generateDraftsHint"));
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const result = await api.generateIntakeDrafts(session.id);
      setSession(result.session);
      setDrafts(asDrafts(result.drafts) ?? asDrafts(result.session.drafts));
      setAnalyzeMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("intake.draftsFailed"));
    } finally {
      setDrafting(false);
    }
  }

  async function patchDraft(key: string, patch: Partial<BugDraft>) {
    if (!session) return;
    setSavingDraft(true);
    setError(null);
    try {
      const result = await api.updateIntakeDraft(session.id, key, patch);
      setSession(result.session);
      setDrafts(asDrafts(result.drafts) ?? asDrafts(result.session.drafts));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("intake.draftSaveFailed"));
    } finally {
      setSavingDraft(false);
    }
  }

  function updateItem(key: string, patch: Partial<CreationPlanItem>) {
    if (!plan) return;
    void persistPlan({
      ...plan,
      items: plan.items.map((item) => (item.key === key ? { ...item, ...patch } : item))
    });
  }

  function removeItems(keys: string[]) {
    if (!plan) return;
    const drop = new Set(keys);
    const remaining = plan.items.filter((i) => !drop.has(i.key));
    if (remaining.length === 0) {
      setError(t("intake.planNeedsItem"));
      return;
    }
    const cleaned = remaining.map((item) =>
      item.parentKey && drop.has(item.parentKey) ? { ...item, parentKey: null } : item
    );
    setSelectedKeys([]);
    void persistPlan({ ...plan, items: cleaned, rationale: plan.rationale || "Edited by user" });
  }

  function addItem() {
    if (!plan) return;
    const item: CreationPlanItem = {
      key: newItemKey(plan.items),
      hubEntityType: "Feature",
      title: t("intake.newItemTitle"),
      storyType: isBug ? "BUG" : "FUNCTIONAL",
      parentKey: null
    };
    void persistPlan({
      ...plan,
      planType: plan.items.length > 0 ? "MULTI_ITEMS" : plan.planType,
      items: [...plan.items, item],
      rationale: plan.rationale || "Edited by user"
    });
  }

  function splitSelected() {
    if (!plan || selectedKeys.length !== 1) return;
    const key = selectedKeys[0]!;
    const item = plan.items.find((i) => i.key === key);
    if (!item) return;
    const leftTitle = item.title.slice(0, Math.ceil(item.title.length / 2)).trim() || item.title;
    const rightTitle = item.title.slice(Math.ceil(item.title.length / 2)).trim() || `${item.title} (2)`;
    const right: CreationPlanItem = {
      ...item,
      key: newItemKey(plan.items),
      title: rightTitle
    };
    void persistPlan({
      ...plan,
      planType: "MULTI_ITEMS",
      items: plan.items.flatMap((i) =>
        i.key === key ? [{ ...i, title: leftTitle }, right] : [i]
      ),
      rationale: plan.rationale || "Split by user"
    });
    setSelectedKeys([]);
  }

  function mergeSelected() {
    if (!plan || selectedKeys.length < 2) return;
    const selected = plan.items.filter((i) => selectedKeys.includes(i.key));
    if (selected.length < 2) return;
    const [first, ...rest] = selected;
    const merged: CreationPlanItem = {
      ...first!,
      title: selected.map((i) => i.title).join(" · "),
      hubEntityType: first!.hubEntityType
    };
    const drop = new Set(rest.map((i) => i.key));
    const items = plan.items
      .filter((i) => !drop.has(i.key))
      .map((i) => (i.key === merged.key ? merged : i))
      .map((i) => (i.parentKey && drop.has(i.parentKey) ? { ...i, parentKey: merged.key } : i));
    void persistPlan({
      ...plan,
      items,
      rationale: plan.rationale || "Merged by user"
    });
    setSelectedKeys([merged.key]);
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

  const questions = plan?.clarificationQuestions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
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
            disabled={!session || analyzing || drafting}
            placeholder={t("intake.composerPlaceholder")}
            onChange={(e) => setRawText(e.target.value)}
          />

          {session ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {t("intake.attachments")}
              </p>
              <AttachmentPanel target={{ intakeSessionId: session.id }} />
            </div>
          ) : null}

          {clarifying && questions.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-950">{t("intake.clarifyTitle")}</p>
              {questions.map((q) => (
                <div key={q.id} className="space-y-1">
                  <label className="text-xs font-medium text-slate-700" htmlFor={`clarify-${q.id}`}>
                    {q.prompt}
                  </label>
                  {q.choices && q.choices.length > 0 ? (
                    <Select
                      id={`clarify-${q.id}`}
                      value={clarifyAnswers[q.id] ?? ""}
                      onChange={(e) =>
                        setClarifyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                    >
                      <option value="">{t("intake.clarifyChoose")}</option>
                      {q.choices.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={`clarify-${q.id}`}
                      value={clarifyAnswers[q.id] ?? ""}
                      onChange={(e) =>
                        setClarifyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))}
              <Button type="button" size="sm" disabled={analyzing} onClick={() => void submitClarification()}>
                {t("intake.submitClarification")}
              </Button>
            </div>
          ) : null}

          {plan && !clarifying ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">
                  {t("intake.planTitle")} · {plan.planType}
                  {typeof plan.confidence === "number" ? (
                    <span className="ml-2 font-normal text-slate-500">
                      {t("intake.confidence", { value: Math.round(plan.confidence * 100) })}
                    </span>
                  ) : null}
                </p>
                {savingPlan ? <span className="text-[11px] text-slate-500">{t("intake.savingPlan")}</span> : null}
              </div>
              {plan.rationale ? <p className="text-[11px] text-slate-600">{plan.rationale}</p> : null}

              <ul className="space-y-2">
                {plan.items.map((item) => {
                  const selected = selectedKeys.includes(item.key);
                  return (
                    <li
                      key={item.key}
                      className={`rounded-md border bg-white p-2 ${
                        selected ? "border-blue-500" : "border-slate-200"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          aria-label={t("intake.selectItem")}
                          onChange={() =>
                            setSelectedKeys((prev) =>
                              prev.includes(item.key)
                                ? prev.filter((k) => k !== item.key)
                                : [...prev, item.key]
                            )
                          }
                        />
                        <Select
                          value={item.hubEntityType}
                          aria-label={t("intake.entityType")}
                          onChange={(e) =>
                            updateItem(item.key, {
                              hubEntityType: e.target.value as CreationPlanItem["hubEntityType"],
                              storyType:
                                e.target.value === "Feature"
                                  ? item.storyType ?? (isBug ? "BUG" : "FUNCTIONAL")
                                  : null
                            })
                          }
                        >
                          <option value="Initiative">Initiative</option>
                          <option value="Feature">Feature</option>
                          <option value="Requirement">Requirement</option>
                        </Select>
                        {item.hubEntityType === "Feature" ? (
                          <Select
                            value={item.storyType ?? "FUNCTIONAL"}
                            aria-label={t("intake.storyType")}
                            onChange={(e) =>
                              updateItem(item.key, {
                                storyType: e.target.value as NonNullable<CreationPlanItem["storyType"]>
                              })
                            }
                          >
                            <option value="FUNCTIONAL">FUNCTIONAL</option>
                            <option value="BUG">BUG</option>
                            <option value="TECH_DEBT">TECH_DEBT</option>
                            <option value="RESEARCH">RESEARCH</option>
                          </Select>
                        ) : null}
                        <button
                          type="button"
                          className="ml-auto text-[11px] text-red-700 hover:underline"
                          onClick={() => removeItems([item.key])}
                        >
                          {t("intake.remove")}
                        </button>
                      </div>
                      <Input
                        value={item.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          setPlan((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  items: prev.items.map((i) =>
                                    i.key === item.key ? { ...i, title } : i
                                  )
                                }
                              : prev
                          );
                        }}
                        onBlur={(e) => {
                          const title = e.target.value.trim() || item.title;
                          if (title !== item.title) updateItem(item.key, { title });
                        }}
                      />
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => addItem()}>
                  {t("intake.addItem")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={selectedKeys.length !== 1}
                  onClick={() => splitSelected()}
                >
                  {t("intake.split")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={selectedKeys.length < 2}
                  onClick={() => mergeSelected()}
                >
                  {t("intake.merge")}
                </Button>
              </div>
            </div>
          ) : null}

          {drafts ? (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">{t("intake.draftsTitle")}</p>
                {savingDraft ? <span className="text-[11px] text-slate-500">{t("intake.savingPlan")}</span> : null}
              </div>
              <p className="text-[11px] text-slate-600">{t("intake.draftCommitHint")}</p>
              {drafts.items.map((draft) => (
                <div key={draft.key} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                  <Input
                    value={draft.title}
                    aria-label={t("intake.draftsTitle")}
                    onChange={(e) => {
                      const title = e.target.value;
                      setDrafts((prev) =>
                        prev
                          ? {
                              ...prev,
                              items: prev.items.map((d) =>
                                d.key === draft.key ? { ...d, title } : d
                              )
                            }
                          : prev
                      );
                    }}
                    onBlur={(e) => {
                      const title = e.target.value.trim() || draft.title;
                      void patchDraft(draft.key, { title });
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <label className="text-[11px] text-slate-600">
                      {t("intake.draftSeverity")}
                      <Select
                        className="mt-1 block"
                        value={draft.severity}
                        aria-label={t("intake.draftSeverity")}
                        onChange={(e) =>
                          void patchDraft(draft.key, {
                            severity: e.target.value as BugDraft["severity"]
                          })
                        }
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </Select>
                    </label>
                    <label className="text-[11px] text-slate-600">
                      {t("intake.draftPriority")}
                      <Select
                        className="mt-1 block"
                        value={draft.priority}
                        aria-label={t("intake.draftPriority")}
                        onChange={(e) =>
                          void patchDraft(draft.key, {
                            priority: e.target.value as BugDraft["priority"]
                          })
                        }
                      >
                        <option value="P0">P0</option>
                        <option value="P1">P1</option>
                        <option value="P2">P2</option>
                        <option value="P3">P3</option>
                      </Select>
                    </label>
                  </div>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    aria-label={t("intake.draftDescription")}
                    onChange={(e) => {
                      const description = e.target.value;
                      setDrafts((prev) =>
                        prev
                          ? {
                              ...prev,
                              items: prev.items.map((d) =>
                                d.key === draft.key ? { ...d, description } : d
                              )
                            }
                          : prev
                      );
                    }}
                    onBlur={(e) => {
                      void patchDraft(draft.key, { description: e.target.value });
                    }}
                  />
                  <Textarea
                    rows={3}
                    value={draft.stepsToReproduce.join("\n")}
                    aria-label={t("intake.draftSteps")}
                    placeholder={t("intake.draftSteps")}
                    onChange={(e) => {
                      const stepsToReproduce = e.target.value.split("\n");
                      setDrafts((prev) =>
                        prev
                          ? {
                              ...prev,
                              items: prev.items.map((d) =>
                                d.key === draft.key ? { ...d, stepsToReproduce } : d
                              )
                            }
                          : prev
                      );
                    }}
                    onBlur={(e) => {
                      const stepsToReproduce = e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean);
                      void patchDraft(draft.key, { stepsToReproduce });
                    }}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Textarea
                      rows={2}
                      value={draft.expected}
                      aria-label={t("intake.draftExpected")}
                      placeholder={t("intake.draftExpected")}
                      onBlur={(e) => {
                        void patchDraft(draft.key, { expected: e.target.value });
                      }}
                      onChange={(e) => {
                        const expected = e.target.value;
                        setDrafts((prev) =>
                          prev
                            ? {
                                ...prev,
                                items: prev.items.map((d) =>
                                  d.key === draft.key ? { ...d, expected } : d
                                )
                              }
                            : prev
                        );
                      }}
                    />
                    <Textarea
                      rows={2}
                      value={draft.actual}
                      aria-label={t("intake.draftActual")}
                      placeholder={t("intake.draftActual")}
                      onBlur={(e) => {
                        void patchDraft(draft.key, { actual: e.target.value });
                      }}
                      onChange={(e) => {
                        const actual = e.target.value;
                        setDrafts((prev) =>
                          prev
                            ? {
                                ...prev,
                                items: prev.items.map((d) =>
                                  d.key === draft.key ? { ...d, actual } : d
                                )
                              }
                            : prev
                        );
                      }}
                    />
                  </div>
                  <Input
                    value={draft.environment}
                    aria-label={t("intake.draftEnvironment")}
                    placeholder={t("intake.draftEnvironment")}
                    onBlur={(e) => {
                      void patchDraft(draft.key, { environment: e.target.value });
                    }}
                    onChange={(e) => {
                      const environment = e.target.value;
                      setDrafts((prev) =>
                        prev
                          ? {
                              ...prev,
                              items: prev.items.map((d) =>
                                d.key === draft.key ? { ...d, environment } : d
                              )
                            }
                          : prev
                      );
                    }}
                  />
                </div>
              ))}
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!session || analyzing || drafting}
            onClick={() => void runAnalyze()}
          >
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
              disabled={!session || drafting || (isBug ? !canGenerateDrafts : !planReady)}
              title={isBug ? undefined : t("intake.generateDraftsHint")}
              onClick={() => void runGenerateDrafts()}
            >
              {drafting ? t("intake.generatingDrafts") : t("intake.generateDrafts")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

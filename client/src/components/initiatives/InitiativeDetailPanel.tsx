import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Demand, Domain, Initiative, InitiativeComment, InitiativeKPI, InitiativeMilestone, Persona, Product, RevenueStream, Stakeholder, SuccessCriterion, User } from "../../types/models";
import type { MilestoneStatus, StakeholderRole, StakeholderType } from "../../types/models";
import { PersonaRadar } from "../charts/PersonaRadar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input, Label, Select } from "../ui/Field";
import { InitiativeForm, type InitiativeFormHandle } from "./InitiativeForm";

function NotifyMeButton({ initiativeId }: { initiativeId: string }) {
  const { t } = useTranslation();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const subscribe = useCallback(async () => {
    if (loading || subscribed) return;
    setLoading(true);
    try {
      await api.createNotificationSubscription({
        action: "UPDATED",
        entityType: "INITIATIVE",
        scopeType: "INITIATIVE",
        scopeId: initiativeId
      });
      setSubscribed(true);
    } catch {
      /* already subscribed or error */
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }, [initiativeId, loading, subscribed]);

  if (subscribed) {
    return (
      <span className="flex items-center gap-1 text-sm text-slate-500">
        <Check className="h-4 w-4 text-green-600" />
        {t("notificationSubscriptions.notifyMe")}
      </span>
    );
  }
  return (
    <Button variant="secondary" onClick={subscribe} disabled={loading}>
      <Bell className="h-4 w-4" />
      {t("notificationSubscriptions.notifyMe")}
    </Button>
  );
}

function ShareButton({ initiativeId, title }: { initiativeId: string; title: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/?initiative=${initiativeId}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [initiativeId, title]);

  return (
    <Button variant="secondary" onClick={handleShare}>
      {copied ? (
        <span className="inline-flex items-center gap-1 text-green-700">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
          {t("initiative.copied")}
        </span>
      ) : t("initiative.share")}
    </Button>
  );
}

type Props = {
  initiative: Initiative | null;
  allInitiatives: Initiative[];
  users: User[];
  products: Product[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  domains: Domain[];
  currentUserId: string | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type Tab = "details" | "features" | "milestones" | "kpis" | "stakeholders" | "requirements" | "decisions" | "risks" | "dependencies" | "demand-links" | "raci" | "timeline";

const TAB_KEYS: Record<Tab, string> = {
  details: "tabs.details",
  features: "tabs.features",
  milestones: "tabs.milestones",
  kpis: "tabs.kpis",
  stakeholders: "tabs.stakeholders",
  requirements: "tabs.requirements",
  decisions: "tabs.decisions",
  risks: "tabs.risks",
  dependencies: "tabs.dependencies",
  "demand-links": "tabs.demandLinks",
  raci: "tabs.raci",
  timeline: "tabs.timeline",
};

const ALL_TABS: Tab[] = ["details", "features", "milestones", "kpis", "stakeholders", "requirements", "decisions", "risks", "dependencies", "demand-links", "raci", "timeline"];

function TabPicker({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="mb-4">
      {/* Mobile/tablet: dropdown picker */}
      <div className="lg:hidden relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm active:bg-sky-700"
        >
          <span>{t(TAB_KEYS[tab])}</span>
          <ChevronDown size={16} className={`text-sky-200 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {ALL_TABS.map((item) => (
              <button
                key={item}
                onClick={() => { onTabChange(item); setOpen(false); }}
                className={`flex w-full items-center px-4 py-2.5 text-sm ${
                  tab === item ? "bg-sky-50 font-medium text-sky-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t(TAB_KEYS[item])}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Desktop: horizontal button row */}
      <div className="hidden lg:flex flex-wrap gap-2">
        {ALL_TABS.map((item) => (
          <Button key={item} variant={tab === item ? "primary" : "secondary"} onClick={() => onTabChange(item)}>
            {t(TAB_KEYS[item])}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function InitiativeDetailPanel({
  initiative,
  allInitiatives,
  users,
  products,
  personas,
  revenueStreams,
  domains,
  currentUserId,
  readOnly,
  onClose,
  onSaved
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("details");
  const [input, setInput] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedFeatureId, setSelectedFeatureId] = useState("");
  const [selectedDemandId, setSelectedDemandId] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const formRef = useRef<InitiativeFormHandle>(null);

  const tryClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  useEffect(() => {
    if (!initiative) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showUnsavedDialog) {
          setShowUnsavedDialog(false);
        } else {
          tryClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [initiative, tryClose, showUnsavedDialog]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [assignmentRole, setAssignmentRole] = useState<"ACCOUNTABLE" | "IMPLEMENTER" | "CONSULTED" | "INFORMED">("IMPLEMENTER");
  const [timelineStart, setTimelineStart] = useState("");
  const [timelineTarget, setTimelineTarget] = useState("");
  const [timelineMilestone, setTimelineMilestone] = useState("");
  const [demands, setDemands] = useState<Demand[]>([]);
  const [comments, setComments] = useState<InitiativeComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [successCriteria, setSuccessCriteria] = useState<SuccessCriterion[]>([]);
  const [newCriterionTitle, setNewCriterionTitle] = useState("");

  const availableDependencies = useMemo(
    () => allInitiatives.filter((i) => i.id !== initiative?.id),
    [allInitiatives, initiative?.id]
  );

  useEffect(() => {
    if (!initiative) return;
    setIsDirty(false);
    setShowUnsavedDialog(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedFeatureId(initiative.features[0]?.id ?? "");
    setTimelineStart(initiative.startDate ? initiative.startDate.slice(0, 10) : "");
    setTimelineTarget(initiative.targetDate ? initiative.targetDate.slice(0, 10) : "");
    setTimelineMilestone(initiative.milestoneDate ? initiative.milestoneDate.slice(0, 10) : "");
    void api.getDemands().then((r) => setDemands(r.demands));
    void api.getInitiativeComments(initiative.id).then((r) => setComments(r.comments));
    setSuccessCriteria(initiative.successCriteriaItems ?? []);
  }, [initiative]);

  if (!initiative) return null;
  const current = initiative;

  async function createByTab() {
    if (readOnly || !input.trim()) return;
    if (tab === "features") {
      await api.createFeature(current.id, { title: input, status: "IDEA" });
    } else if (tab === "decisions") {
      await api.createDecision(current.id, { title: input });
    } else if (tab === "risks") {
      await api.createRisk(current.id, { title: input, probability: "MEDIUM", impact: "MEDIUM" });
    } else if (tab === "dependencies" && selectedId) {
      await api.createDependency({ fromInitiativeId: current.id, toInitiativeId: selectedId, description: input });
    } else if (tab === "requirements" && selectedFeatureId) {
      await api.createRequirement({ featureId: selectedFeatureId, title: input, isDone: false, priority: "P2" });
    } else if (tab === "demand-links" && selectedDemandId) {
      const existing = current.demandLinks.map((d) => ({ demandId: d.demandId, featureId: d.featureId ?? null }));
      await api.updateInitiative(current.id, {
        demandLinks: [...existing, { demandId: selectedDemandId, featureId: selectedFeatureId || null }]
      });
    } else if (tab === "raci" && selectedUserId) {
      await api.addAssignment({
        initiativeId: current.id,
        userId: selectedUserId,
        role: assignmentRole
      });
    }
    setInput("");
    await onSaved();
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={tryClose}>
      <div className="h-full w-full max-w-full lg:max-w-[780px] overflow-y-auto bg-white p-4 lg:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="h-1 w-full rounded-t" style={{ background: initiative.domain?.color || "#94a3b8" }} />

        {showUnsavedDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-2 text-base font-semibold">{t("initiative.unsavedTitle")}</h3>
              <p className="mb-5 text-sm text-slate-600">
                {t("initiative.unsavedMsg")}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowUnsavedDialog(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    setIsDirty(false);
                    onClose();
                  }}
                >
                  {t("initiative.discard")}
                </Button>
                <Button
                  onClick={async () => {
                    setShowUnsavedDialog(false);
                    await formRef.current?.save();
                    onClose();
                  }}
                >
                  {t("initiative.saveAndClose")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("initiative.detail")}</h2>
          <div className="flex items-center gap-2">
            {tab === "details" && !readOnly ? (
              <Button
                onClick={async () => {
                  await formRef.current?.save();
                }}
              >
                {t("common.save")}
              </Button>
            ) : null}
            <NotifyMeButton initiativeId={initiative.id} />
            <ShareButton initiativeId={initiative.id} title={initiative.title} />
            <Button variant="ghost" onClick={tryClose}>
              {t("app.close")}
            </Button>
          </div>
        </div>
        <TabPicker tab={tab} onTabChange={setTab} />

        {tab === "details" ? (
          <div className="grid gap-4">
            <Card className="p-3">
              <InitiativeForm
                ref={formRef}
                initiative={initiative}
                products={products}
                domains={domains}
                users={users}
                personas={personas}
                revenueStreams={revenueStreams}
                currentUserId={currentUserId}
                readOnly={readOnly}
                hideSaveButton
                onDirtyChange={setIsDirty}
                onSubmit={async (payload) => {
                  await api.updateInitiative(initiative.id, payload);
                  setIsDirty(false);
                  await onSaved();
                }}
                onArchive={
                  readOnly
                    ? undefined
                    : async () => {
                        await api.archiveInitiative(initiative.id);
                        await onSaved();
                        onClose();
                      }
                }
                onUnarchive={
                  readOnly
                    ? undefined
                    : async () => {
                        await api.unarchiveInitiative(initiative.id);
                        await onSaved();
                      }
                }
              />
            </Card>
            <Card className="p-3">
              <p className="mb-2 text-sm font-semibold">{t("initiative.comments")}</p>
              <div className="space-y-2">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm"
                  >
                    <p className="text-slate-800">{c.text}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.user.name} · {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              {!readOnly ? (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={t("initiative.addComment")}
                    className="flex-1"
                  />
                  <Button
                    onClick={async () => {
                      if (!newCommentText.trim()) return;
                      await api.createInitiativeComment(initiative.id, { text: newCommentText.trim() });
                      setNewCommentText("");
                      const r = await api.getInitiativeComments(initiative.id);
                      setComments(r.comments);
                    }}
                    disabled={!newCommentText.trim()}
                  >
                    {t("common.add")}
                  </Button>
                </div>
              ) : null}
            </Card>
            <Card className="p-3">
              <p className="mb-2 text-sm font-semibold">{t("initiative.successCriteria")}</p>
              <div className="space-y-2">
                {successCriteria.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50/80 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (readOnly) return;
                        void api.updateSuccessCriterion(initiative.id, c.id, { isDone: !c.isDone }).then((r) => {
                          setSuccessCriteria((prev) => prev.map((x) => (x.id === c.id ? r.successCriterion : x)));
                        });
                      }}
                      className="flex-shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200"
                      title={c.isDone ? t("initiative.successCriterionUndone") : t("initiative.successCriterionDone")}
                    >
                      {c.isDone ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : (
                        <span className="inline-block h-5 w-5 rounded border border-slate-400" />
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${c.isDone ? "text-slate-500 line-through" : "text-slate-800"}`}>
                      {c.title}
                    </span>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => {
                          void api.deleteSuccessCriterion(initiative.id, c.id).then(() => {
                            setSuccessCriteria((prev) => prev.filter((x) => x.id !== c.id));
                          });
                        }}
                        className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {!readOnly ? (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={newCriterionTitle}
                    onChange={(e) => setNewCriterionTitle(e.target.value)}
                    placeholder={t("initiative.addSuccessCriterion")}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!newCriterionTitle.trim()) return;
                        void api.createSuccessCriterion(initiative.id, { title: newCriterionTitle.trim() }).then((r) => {
                          setSuccessCriteria((prev) => [...prev, r.successCriterion]);
                          setNewCriterionTitle("");
                        });
                      }
                    }}
                  />
                  <Button
                    onClick={async () => {
                      if (!newCriterionTitle.trim()) return;
                      const r = await api.createSuccessCriterion(initiative.id, { title: newCriterionTitle.trim() });
                      setSuccessCriteria((prev) => [...prev, r.successCriterion]);
                      setNewCriterionTitle("");
                    }}
                    disabled={!newCriterionTitle.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </Card>
            <Card className="p-3">
              <p className="mb-2 text-sm font-semibold">{t("initiative.personaRadar")}</p>
              <PersonaRadar initiative={initiative} personas={personas} />
            </Card>
          </div>
        ) : (
          <Card className="p-3">
            {tab === "timeline" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                <Input type="date" value={timelineStart} onChange={(e) => setTimelineStart(e.target.value)} disabled={readOnly} />
                <Input type="date" value={timelineTarget} onChange={(e) => setTimelineTarget(e.target.value)} disabled={readOnly} />
                <Input type="date" value={timelineMilestone} onChange={(e) => setTimelineMilestone(e.target.value)} disabled={readOnly} />
                <Button
                  disabled={readOnly}
                  onClick={async () => {
                    await api.updateInitiative(current.id, {
                      startDate: timelineStart ? `${timelineStart}T00:00:00.000Z` : null,
                      targetDate: timelineTarget ? `${timelineTarget}T00:00:00.000Z` : null,
                      milestoneDate: timelineMilestone ? `${timelineMilestone}T00:00:00.000Z` : null
                    });
                    await onSaved();
                  }}
                >
                  {t("common.save")}
                </Button>
              </div>
            ) : tab === "dependencies" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
                <div>
                  <Label>{t("initiative.dependsOn")}</Label>
                  <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={readOnly}>
                    <option value="">{t("initiative.selectInitiative")}</option>
                    {availableDependencies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t("common.description")}</Label>
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("initiative.dependencyReason")}
                    disabled={readOnly}
                  />
                </div>
                <div className="self-end">
                  <Button onClick={createByTab} disabled={readOnly || !selectedId}>
                    {t("common.add")}
                  </Button>
                </div>
              </div>
            ) : tab === "requirements" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
                <Select value={selectedFeatureId} onChange={(e) => setSelectedFeatureId(e.target.value)} disabled={readOnly}>
                  <option value="">{t("initiative.selectFeature")}</option>
                  {current.features.map((feature) => (
                    <option key={feature.id} value={feature.id}>
                      {feature.title}
                    </option>
                  ))}
                </Select>
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("initiative.requirementTitle")} disabled={readOnly} />
                <Button onClick={createByTab} disabled={readOnly || !selectedFeatureId || !input.trim()}>
                  {t("common.add")}
                </Button>
              </div>
            ) : tab === "demand-links" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Select value={selectedDemandId} onChange={(e) => setSelectedDemandId(e.target.value)} disabled={readOnly}>
                  <option value="">{t("initiative.selectDemand")}</option>
                  {demands.map((demand) => (
                    <option key={demand.id} value={demand.id}>
                      {demand.title}
                    </option>
                  ))}
                </Select>
                <Select value={selectedFeatureId} onChange={(e) => setSelectedFeatureId(e.target.value)} disabled={readOnly}>
                  <option value="">{t("initiative.optionalFeature")}</option>
                  {current.features.map((feature) => (
                    <option key={feature.id} value={feature.id}>
                      {feature.title}
                    </option>
                  ))}
                </Select>
                <Button onClick={createByTab} disabled={readOnly || !selectedDemandId}>
                  {t("common.link")}
                </Button>
              </div>
            ) : tab === "raci" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} disabled={readOnly}>
                  <option value="">{t("initiative.selectUser")}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
                <Select value={assignmentRole} onChange={(e) => setAssignmentRole(e.target.value as typeof assignmentRole)} disabled={readOnly}>
                  {(["ACCOUNTABLE", "IMPLEMENTER", "CONSULTED", "INFORMED"] as const).map((r) => (
                    <option key={r} value={r}>{t(`assignmentRole.${r}`)}</option>
                  ))}
                </Select>
                <Button onClick={createByTab} disabled={readOnly || !selectedUserId}>
                  {t("initiative.addRole")}
                </Button>
              </div>
            ) : tab === "milestones" || tab === "kpis" || tab === "stakeholders" ? null : (
              <div className="mb-2 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`${t("common.add")} ${t(TAB_KEYS[tab]).toLowerCase()}...`}
                  disabled={readOnly}
                />
                <Button onClick={createByTab} disabled={readOnly || !input.trim()}>
                  {t("common.add")}
                </Button>
              </div>
            )}

            {tab === "milestones" && (
              <MilestonesGrid
                milestones={initiative.milestones ?? []}
                initiativeId={initiative.id}
                users={users}
                readOnly={readOnly}
                onSaved={onSaved}
              />
            )}
            {tab === "kpis" && (
              <KpisGrid
                kpis={initiative.kpis ?? []}
                initiativeId={initiative.id}
                readOnly={readOnly}
                onSaved={onSaved}
              />
            )}
            {tab === "stakeholders" && (
              <StakeholdersGrid
                stakeholders={initiative.stakeholders ?? []}
                initiativeId={initiative.id}
                readOnly={readOnly}
                onSaved={onSaved}
              />
            )}

            <div className="grid gap-2 text-sm">
              {tab === "features" &&
                initiative.features.map((feature) => (
                  <Row
                    key={feature.id}
                    label={`${feature.title} (${feature.status})`}
                    linkTo={`/features/${feature.id}`}
                    onDelete={
                      readOnly
                        ? undefined
                        : async () => {
                            await api.deleteFeature(feature.id);
                            await onSaved();
                          }
                    }
                  />
                ))}
              {tab === "requirements" &&
                initiative.features.flatMap((feature) =>
                  (feature.requirements ?? []).map((requirement) => (
                    <Row
                      key={requirement.id}
                      label={`${requirement.title} (${requirement.isDone ? t("common.done") : t("common.open")})`}
                      linkTo={`/requirements/${requirement.id}`}
                      onDelete={
                        readOnly
                          ? undefined
                          : async () => {
                              await api.deleteRequirement(requirement.id);
                              await onSaved();
                            }
                      }
                    />
                  ))
                )}
              {tab === "decisions" &&
                initiative.decisions.map((decision) => (
                  <Row
                    key={decision.id}
                    label={decision.title}
                    onDelete={
                      readOnly
                        ? undefined
                        : async () => {
                            await api.deleteDecision(decision.id);
                            await onSaved();
                          }
                    }
                  />
                ))}
              {tab === "risks" &&
                initiative.risks.map((risk) => (
                  <Row
                    key={risk.id}
                    label={`${risk.title} (${risk.probability}/${risk.impact})`}
                    onDelete={
                      readOnly
                        ? undefined
                        : async () => {
                            await api.deleteRisk(risk.id);
                            await onSaved();
                          }
                    }
                  />
                ))}
              {tab === "dependencies" &&
                initiative.outgoingDeps.map((dep) => (
                  (() => {
                    const target = allInitiatives.find((i) => i.id === dep.toInitiativeId);
                    return (
                  <Row
                    key={`${dep.fromInitiativeId}-${dep.toInitiativeId}`}
                    label={`${t("initiative.dependsOnTitle", { title: target?.title ?? dep.toInitiativeId })}${dep.description ? `: ${dep.description}` : ""}`}
                    onDelete={
                      readOnly
                        ? undefined
                        : async () => {
                            await api.deleteDependency({
                              fromInitiativeId: dep.fromInitiativeId,
                              toInitiativeId: dep.toInitiativeId
                            });
                            await onSaved();
                          }
                    }
                  />
                    );
                  })()
                ))}
              {tab === "demand-links" &&
                initiative.demandLinks.map((link) => (
                  <Row
                    key={link.id}
                    label={`${link.demand?.title ?? link.demandId}${link.feature ? ` -> ${link.feature.title}` : ""}`}
                    onDelete={
                      readOnly
                        ? undefined
                        : async () => {
                            await api.updateInitiative(current.id, {
                              demandLinks: current.demandLinks
                                .filter((d) => d.id !== link.id)
                                .map((d) => ({ demandId: d.demandId, featureId: d.featureId ?? null }))
                            });
                            await onSaved();
                          }
                    }
                  />
                ))}
              {tab === "raci" &&
                initiative.assignments.map((assignment) => (
                  <Row
                    key={`${assignment.initiativeId}-${assignment.userId}-${assignment.role}`}
                    label={`${assignment.role}: ${assignment.user.name}${assignment.allocation ? ` (${assignment.allocation}%)` : ""}`}
                    onDelete={
                      readOnly
                        ? undefined
                        : async () => {
                            await api.removeAssignment({
                              initiativeId: assignment.initiativeId,
                              userId: assignment.userId,
                              role: assignment.role
                            });
                            await onSaved();
                          }
                    }
                  />
                ))}
              {tab === "timeline" && (
                <div className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600">
                  {t("initiative.timelineHint")}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, onDelete, linkTo }: { label: string; onDelete?: () => Promise<void>; linkTo?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
      {linkTo ? (
        <Link to={linkTo} className="text-sky-600 hover:underline">
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
      {onDelete ? (
        <Button variant="ghost" onClick={onDelete}>
          {t("common.remove")}
        </Button>
      ) : null}
    </div>
  );
}

const MILESTONE_STATUSES: MilestoneStatus[] = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];
const MILESTONE_STATUS_COLORS: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

function InlineText({ value, onSave, disabled, placeholder, className }: {
  value: string; onSave: (v: string) => void; disabled?: boolean; placeholder?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (disabled || !editing) {
    return (
      <span
        className={`cursor-pointer rounded px-1 py-0.5 hover:bg-slate-100 ${!value ? "text-slate-400 italic" : ""} ${className ?? ""}`}
        onClick={() => !disabled && setEditing(true)}
      >
        {value || placeholder || "—"}
      </span>
    );
  }
  return (
    <input
      ref={inputRef}
      className="w-full rounded border-2 border-sky-500 px-1 py-0.5 text-sm outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); if (draft !== value) onSave(draft); } if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
    />
  );
}

function InlineSelect<T extends string>({ value, options, onSave, disabled, renderLabel }: {
  value: T; options: T[]; onSave: (v: T) => void; disabled?: boolean; renderLabel: (v: T) => string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (disabled || !editing) {
    return (
      <span className="cursor-pointer rounded px-1 py-0.5 hover:bg-slate-100" onClick={() => !disabled && setEditing(true)}>
        {renderLabel(value)}
      </span>
    );
  }
  return (
    <select
      ref={ref}
      className="rounded border-2 border-sky-500 px-1 py-0.5 text-sm outline-none"
      value={value}
      onChange={(e) => { onSave(e.target.value as T); setEditing(false); }}
      onBlur={() => setEditing(false)}
    >
      {options.map((o) => <option key={o} value={o}>{renderLabel(o)}</option>)}
    </select>
  );
}

function InlineDate({ value, onSave, disabled }: { value: string | null | undefined; onSave: (v: string | null) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const display = value ? value.slice(0, 10) : "";
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (disabled || !editing) {
    return (
      <span className="cursor-pointer rounded px-1 py-0.5 hover:bg-slate-100 text-slate-600" onClick={() => !disabled && setEditing(true)}>
        {display || "—"}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      type="date"
      className="rounded border-2 border-sky-500 px-1 py-0.5 text-sm outline-none"
      defaultValue={display}
      onBlur={(e) => { setEditing(false); const v = e.target.value; onSave(v ? `${v}T00:00:00.000Z` : null); }}
      onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
    />
  );
}

function MilestonesGrid({ milestones, initiativeId, users, readOnly, onSaved }: {
  milestones: InitiativeMilestone[]; initiativeId: string; users: User[]; readOnly: boolean; onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newTitle, setNewTitle] = useState("");

  async function addMilestone() {
    if (!newTitle.trim()) return;
    await api.createMilestone(initiativeId, { title: newTitle, status: "TODO", sequence: milestones.length });
    setNewTitle("");
    await onSaved();
  }

  async function updateField(id: string, field: string, value: unknown) {
    await api.updateMilestone(id, { [field]: value });
    await onSaved();
  }

  return (
    <div className="grid gap-2">
      {!readOnly && (
        <div className="flex gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("initiative.newMilestone")}
            onKeyDown={(e) => { if (e.key === "Enter") addMilestone(); }} />
          <Button onClick={addMilestone} disabled={!newTitle.trim()}>{t("common.add")}</Button>
        </div>
      )}
      {milestones.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">{t("common.title")}</th>
                <th className="px-2 py-2">{t("common.status")}</th>
                <th className="px-2 py-2">{t("initiative.targetDate")}</th>
                <th className="px-2 py-2">{t("initiative.owner")}</th>
                {!readOnly && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, i) => (
                <tr key={m.id} className="border-t border-slate-200 hover:bg-slate-50/50">
                  <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-2 py-2 font-medium">
                    <InlineText value={m.title} onSave={(v) => updateField(m.id, "title", v)} disabled={readOnly} />
                  </td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${MILESTONE_STATUS_COLORS[m.status]}`}>
                        {t(`milestoneStatus.${m.status}`)}
                      </span>
                    ) : (
                      <InlineSelect
                        value={m.status}
                        options={MILESTONE_STATUSES}
                        onSave={(v) => updateField(m.id, "status", v)}
                        renderLabel={(v) => t(`milestoneStatus.${v}`)}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <InlineDate value={m.targetDate} onSave={(v) => updateField(m.id, "targetDate", v)} disabled={readOnly} />
                  </td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      <span>{m.owner?.name ?? "—"}</span>
                    ) : (
                      <InlineSelect
                        value={m.ownerId ?? ""}
                        options={["", ...users.map(u => u.id)]}
                        onSave={(v) => updateField(m.id, "ownerId", v || null)}
                        renderLabel={(v) => users.find(u => u.id === v)?.name ?? "—"}
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2">
                      <Button variant="ghost" onClick={async () => { if (!window.confirm(t("milestonesTimeline.deleteConfirm", { name: m.title }))) return; await api.deleteMilestone(m.id); await onSaved(); }}>
                        {t("common.remove")}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {milestones.length === 0 && (
        <div className="rounded border border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
          {t("common.none")}
        </div>
      )}
    </div>
  );
}

function KpiProgressBar({ current, target }: { current: string | null | undefined; target: string | null | undefined }) {
  const cur = parseFloat(current ?? "");
  const tar = parseFloat(target ?? "");
  if (isNaN(cur) || isNaN(tar) || tar === 0) return <span className="text-xs text-slate-400">—</span>;
  const pct = Math.min(Math.round((cur / tar) * 100), 100);
  const color = pct < 34 ? "bg-red-500" : pct < 67 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full max-w-[120px] rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-500">{pct}%</span>
    </div>
  );
}

function KpisGrid({ kpis, initiativeId, readOnly, onSaved }: {
  kpis: InitiativeKPI[]; initiativeId: string; readOnly: boolean; onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newTitle, setNewTitle] = useState("");

  async function addKpi() {
    if (!newTitle.trim()) return;
    await api.createKpi(initiativeId, { title: newTitle });
    setNewTitle("");
    await onSaved();
  }

  async function updateField(id: string, field: string, value: unknown) {
    await api.updateKpi(id, { [field]: value });
    await onSaved();
  }

  return (
    <div className="grid gap-2">
      {!readOnly && (
        <div className="flex gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("initiative.newKpi")}
            onKeyDown={(e) => { if (e.key === "Enter") addKpi(); }} />
          <Button onClick={addKpi} disabled={!newTitle.trim()}>{t("common.add")}</Button>
        </div>
      )}
      {kpis.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">KPI</th>
                <th className="px-2 py-2">{t("initiative.target")}</th>
                <th className="px-2 py-2">{t("initiative.current")}</th>
                <th className="px-2 py-2">{t("initiative.unit")}</th>
                <th className="px-2 py-2">{t("kpiDashboard.targetDate")}</th>
                <th className="px-2 py-2">{t("initiative.progress")}</th>
                {!readOnly && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.id} className="border-t border-slate-200 hover:bg-slate-50/50">
                  <td className="px-2 py-2 font-medium">
                    <InlineText value={k.title} onSave={(v) => updateField(k.id, "title", v)} disabled={readOnly} />
                  </td>
                  <td className="px-2 py-2">
                    <InlineText value={k.targetValue ?? ""} onSave={(v) => updateField(k.id, "targetValue", v || null)} disabled={readOnly} placeholder="—" />
                  </td>
                  <td className="px-2 py-2">
                    <InlineText value={k.currentValue ?? ""} onSave={(v) => updateField(k.id, "currentValue", v || null)} disabled={readOnly} placeholder="—" />
                  </td>
                  <td className="px-2 py-2">
                    <InlineText value={k.unit ?? ""} onSave={(v) => updateField(k.id, "unit", v || null)} disabled={readOnly} placeholder="—" />
                  </td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      <span className="text-sm">{k.targetDate ? k.targetDate.slice(0, 10) : "—"}</span>
                    ) : (
                      <input
                        type="date"
                        className="rounded border border-slate-200 px-1 py-0.5 text-sm hover:border-blue-400 focus:border-sky-500 focus:outline-none"
                        value={k.targetDate ? k.targetDate.slice(0, 10) : ""}
                        onChange={async (e) => {
                          const v = e.target.value;
                          await updateField(k.id, "targetDate", v ? `${v}T00:00:00.000Z` : null);
                        }}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <KpiProgressBar current={k.currentValue} target={k.targetValue} />
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2">
                      <Button variant="ghost" onClick={async () => { if (!window.confirm(t("milestonesTimeline.deleteConfirm", { name: k.title }))) return; await api.deleteKpi(k.id); await onSaved(); }}>
                        {t("common.remove")}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {kpis.length === 0 && (
        <div className="rounded border border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
          {t("common.none")}
        </div>
      )}
    </div>
  );
}

const STAKEHOLDER_ROLES: StakeholderRole[] = ["DECISION_MAKER", "SPONSOR", "REVIEWER", "AMBASSADOR", "LEGAL", "MEDICAL"];
const STAKEHOLDER_TYPES: StakeholderType[] = ["INTERNAL", "EXTERNAL"];
const ROLE_COLORS: Record<string, string> = {
  DECISION_MAKER: "bg-amber-100 text-amber-800",
  SPONSOR: "bg-blue-100 text-blue-700",
  REVIEWER: "bg-indigo-100 text-indigo-700",
  AMBASSADOR: "bg-green-100 text-green-700",
  LEGAL: "bg-slate-100 text-slate-600",
  MEDICAL: "bg-pink-100 text-pink-700",
};
const TYPE_COLORS: Record<string, string> = {
  INTERNAL: "bg-green-100 text-green-700",
  EXTERNAL: "bg-red-100 text-red-600",
};

function StakeholdersGrid({ stakeholders, initiativeId, readOnly, onSaved }: {
  stakeholders: Stakeholder[]; initiativeId: string; readOnly: boolean; onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<StakeholderRole>("SPONSOR");
  const [newType, setNewType] = useState<StakeholderType>("INTERNAL");
  const [newOrg, setNewOrg] = useState("");

  async function addStakeholder() {
    if (!newName.trim()) return;
    await api.createStakeholder(initiativeId, { name: newName, role: newRole, type: newType, organization: newOrg || null });
    setNewName(""); setNewOrg("");
    await onSaved();
  }

  async function updateField(id: string, field: string, value: unknown) {
    await api.updateStakeholder(id, { [field]: value });
    await onSaved();
  }

  return (
    <div className="grid gap-2">
      {!readOnly && (
        <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("initiative.stakeholderName")} className="min-w-[150px] flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") addStakeholder(); }} />
          <Select value={newRole} onChange={(e) => setNewRole(e.target.value as StakeholderRole)} className="w-auto">
            {STAKEHOLDER_ROLES.map((r) => <option key={r} value={r}>{t(`stakeholderRole.${r}`)}</option>)}
          </Select>
          <Select value={newType} onChange={(e) => setNewType(e.target.value as StakeholderType)} className="w-auto">
            {STAKEHOLDER_TYPES.map((st) => <option key={st} value={st}>{t(`stakeholderType.${st}`)}</option>)}
          </Select>
          <Input value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder={t("initiative.stakeholderOrg")} className="min-w-[130px] flex-1" />
          <Button onClick={addStakeholder} disabled={!newName.trim()}>{t("common.add")}</Button>
        </div>
      )}
      {stakeholders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">{t("common.name")}</th>
                <th className="px-2 py-2">{t("common.role")}</th>
                <th className="px-2 py-2">{t("common.type")}</th>
                <th className="px-2 py-2">{t("initiative.organization")}</th>
                {!readOnly && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id} className="border-t border-slate-200 hover:bg-slate-50/50">
                  <td className="px-2 py-2 font-medium">
                    <InlineText value={s.name} onSave={(v) => updateField(s.id, "name", v)} disabled={readOnly} />
                  </td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${ROLE_COLORS[s.role]}`}>
                        {t(`stakeholderRole.${s.role}`)}
                      </span>
                    ) : (
                      <InlineSelect
                        value={s.role}
                        options={STAKEHOLDER_ROLES}
                        onSave={(v) => updateField(s.id, "role", v)}
                        renderLabel={(v) => t(`stakeholderRole.${v}`)}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_COLORS[s.type]}`}>
                        {t(`stakeholderType.${s.type}`)}
                      </span>
                    ) : (
                      <InlineSelect
                        value={s.type}
                        options={STAKEHOLDER_TYPES}
                        onSave={(v) => updateField(s.id, "type", v)}
                        renderLabel={(v) => t(`stakeholderType.${v}`)}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <InlineText value={s.organization ?? ""} onSave={(v) => updateField(s.id, "organization", v || null)} disabled={readOnly} placeholder="—" />
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2">
                      <Button variant="ghost" onClick={async () => { if (!window.confirm(t("milestonesTimeline.deleteConfirm", { name: s.name }))) return; await api.deleteStakeholder(s.id); await onSaved(); }}>
                        {t("common.remove")}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stakeholders.length === 0 && (
        <div className="rounded border border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
          {t("common.none")}
        </div>
      )}
    </div>
  );
}

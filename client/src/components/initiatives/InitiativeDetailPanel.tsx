import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import type { Demand, Domain, Initiative, Persona, Product, RevenueStream, User } from "../../types/models";
import { PersonaRadar } from "../charts/PersonaRadar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input, Label, Select } from "../ui/Field";
import { InitiativeForm, type InitiativeFormHandle } from "./InitiativeForm";

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
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type Tab = "details" | "features" | "requirements" | "decisions" | "risks" | "dependencies" | "demand-links" | "raci" | "timeline";

const TAB_KEYS: Record<Tab, string> = {
  details: "tabs.details",
  features: "tabs.features",
  requirements: "tabs.requirements",
  decisions: "tabs.decisions",
  risks: "tabs.risks",
  dependencies: "tabs.dependencies",
  "demand-links": "tabs.demandLinks",
  raci: "tabs.raci",
  timeline: "tabs.timeline",
};

const ALL_TABS: Tab[] = ["details", "features", "requirements", "decisions", "risks", "dependencies", "demand-links", "raci", "timeline"];

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
                readOnly={readOnly}
                onDirtyChange={setIsDirty}
                onSubmit={async (payload) => {
                  await api.updateInitiative(initiative.id, payload);
                  setIsDirty(false);
                  await onSaved();
                }}
                onDelete={
                  readOnly
                    ? undefined
                    : async () => {
                        await api.deleteInitiative(initiative.id);
                        await onSaved();
                        onClose();
                      }
                }
              />
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
            ) : (
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

            <div className="grid gap-2 text-sm">
              {tab === "features" &&
                initiative.features.map((feature) => (
                  <Row
                    key={feature.id}
                    label={`${feature.title} (${feature.status})`}
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

function Row({ label, onDelete }: { label: string; onDelete?: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
      <span>{label}</span>
      {onDelete ? (
        <Button variant="ghost" onClick={onDelete}>
          {t("common.remove")}
        </Button>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { Demand, Domain, Initiative, Persona, Product, RevenueStream, User } from "../../types/models";
import { PersonaRadar } from "../charts/PersonaRadar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input, Label, Select } from "../ui/Field";
import { InitiativeForm } from "./InitiativeForm";

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
  const [tab, setTab] = useState<Tab>("details");
  const [input, setInput] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedFeatureId, setSelectedFeatureId] = useState("");
  const [selectedDemandId, setSelectedDemandId] = useState("");
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
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-[780px] overflow-y-auto bg-white p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Initiative Detail</h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["details", "features", "requirements", "decisions", "risks", "dependencies", "demand-links", "raci", "timeline"] as Tab[]).map((item) => (
            <Button key={item} variant={tab === item ? "primary" : "secondary"} onClick={() => setTab(item)}>
              {item}
            </Button>
          ))}
        </div>

        {tab === "details" ? (
          <div className="grid gap-4">
            <Card className="p-3">
              <InitiativeForm
                initiative={initiative}
                products={products}
                domains={domains}
                users={users}
                personas={personas}
                revenueStreams={revenueStreams}
                readOnly={readOnly}
                onSubmit={async (payload) => {
                  await api.updateInitiative(initiative.id, payload);
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
              <p className="mb-2 text-sm font-semibold">Persona Radar</p>
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
                  Save
                </Button>
              </div>
            ) : tab === "dependencies" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
                <div>
                  <Label>Depends on</Label>
                  <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={readOnly}>
                    <option value="">Select initiative</option>
                    {availableDependencies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Why this dependency exists"
                    disabled={readOnly}
                  />
                </div>
                <div className="self-end">
                  <Button onClick={createByTab} disabled={readOnly || !selectedId}>
                    Add
                  </Button>
                </div>
              </div>
            ) : tab === "requirements" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
                <Select value={selectedFeatureId} onChange={(e) => setSelectedFeatureId(e.target.value)} disabled={readOnly}>
                  <option value="">Select feature</option>
                  {current.features.map((feature) => (
                    <option key={feature.id} value={feature.id}>
                      {feature.title}
                    </option>
                  ))}
                </Select>
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Requirement title" disabled={readOnly} />
                <Button onClick={createByTab} disabled={readOnly || !selectedFeatureId || !input.trim()}>
                  Add
                </Button>
              </div>
            ) : tab === "demand-links" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Select value={selectedDemandId} onChange={(e) => setSelectedDemandId(e.target.value)} disabled={readOnly}>
                  <option value="">Select demand</option>
                  {demands.map((demand) => (
                    <option key={demand.id} value={demand.id}>
                      {demand.title}
                    </option>
                  ))}
                </Select>
                <Select value={selectedFeatureId} onChange={(e) => setSelectedFeatureId(e.target.value)} disabled={readOnly}>
                  <option value="">Optional feature</option>
                  {current.features.map((feature) => (
                    <option key={feature.id} value={feature.id}>
                      {feature.title}
                    </option>
                  ))}
                </Select>
                <Button onClick={createByTab} disabled={readOnly || !selectedDemandId}>
                  Link
                </Button>
              </div>
            ) : tab === "raci" ? (
              <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} disabled={readOnly}>
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
                <Select value={assignmentRole} onChange={(e) => setAssignmentRole(e.target.value as typeof assignmentRole)} disabled={readOnly}>
                  <option value="ACCOUNTABLE">ACCOUNTABLE</option>
                  <option value="IMPLEMENTER">IMPLEMENTER</option>
                  <option value="CONSULTED">CONSULTED</option>
                  <option value="INFORMED">INFORMED</option>
                </Select>
                <Button onClick={createByTab} disabled={readOnly || !selectedUserId}>
                  Add role
                </Button>
              </div>
            ) : (
              <div className="mb-2 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Add ${tab.slice(0, -1)}...`}
                  disabled={readOnly}
                />
                <Button onClick={createByTab} disabled={readOnly || !input.trim()}>
                  Add
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
                      label={`${requirement.title} (${requirement.isDone ? "done" : "open"})`}
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
                    label={`Depends on ${target?.title ?? dep.toInitiativeId}${dep.description ? `: ${dep.description}` : ""}`}
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
                  Configure start/target/milestone dates above and save.
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
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
      <span>{label}</span>
      {onDelete ? (
        <Button variant="ghost" onClick={onDelete}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

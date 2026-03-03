import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { Domain, Initiative, Persona, RevenueStream, User } from "../../types/models";
import { PersonaRadar } from "../charts/PersonaRadar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input, Label, Select } from "../ui/Field";
import { InitiativeForm } from "./InitiativeForm";

type Props = {
  initiative: Initiative | null;
  allInitiatives: Initiative[];
  users: User[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  domains: Domain[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type Tab = "details" | "features" | "decisions" | "risks" | "dependencies";

export function InitiativeDetailPanel({
  initiative,
  allInitiatives,
  users,
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

  const availableDependencies = useMemo(
    () => allInitiatives.filter((i) => i.id !== initiative?.id),
    [allInitiatives, initiative?.id]
  );

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
          {(["details", "features", "decisions", "risks", "dependencies"] as Tab[]).map((item) => (
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
            {tab === "dependencies" ? (
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

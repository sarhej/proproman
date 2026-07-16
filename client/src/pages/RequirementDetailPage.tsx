import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useWorkspaceLinkBuilder } from "../hooks/useWorkspaceHref";
import { api } from "../lib/api";
import type {
  AffectedEnvironment,
  DeployedToStage,
  DesignArtifactLink,
  DesignArtifactProvider,
  Initiative,
  Priority,
  Requirement,
  TaskStatus,
  TaskType,
  User,
  WorkArtifactLink,
  WorkArtifactType,
  RepositoryConnection
} from "../types/models";
import { formatPriority } from "../lib/format";
import { Button } from "../components/ui/Button";
import { Input, Label, Select, Textarea } from "../components/ui/Field";
import { LabelEditor } from "../components/ui/LabelEditor";
import { AttachmentPanel } from "../components/attachments/AttachmentPanel";
import { VoiceMicButton } from "../components/voice/VoiceMicButton";

const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];
const STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "TESTING", "DONE"];
const DEPLOY_STAGES: DeployedToStage[] = ["NOT_DEPLOYED", "STAGING", "PRODUCTION"];
const AFFECTED_ENVS: AffectedEnvironment[] = ["PRODUCTION", "STAGING", "LOCAL", "UNKNOWN"];
const WORK_TYPES: WorkArtifactType[] = ["PR", "BRANCH", "COMMIT", "TAG", "RELEASE", "ISSUE"];
const DESIGN_PROVIDERS: DesignArtifactProvider[] = ["FIGMA", "GENERIC_URL", "CLAUDE_DESIGN"];

type Props = {
  initiatives: Initiative[];
  onOpenInitiative: (initiative: Initiative) => void;
  onSaved?: () => Promise<void>;
  readOnly?: boolean;
};

function findRequirement(
  initiatives: Initiative[],
  requirementId: string
): { requirement: Requirement; initiative: Initiative; feature: { id: string; title: string } } | null {
  for (const init of initiatives) {
    for (const feat of init.features ?? []) {
      const req = feat.requirements?.find((r) => r.id === requirementId);
      if (req) return { requirement: req, initiative: init, feature: { id: feat.id, title: feat.title } };
    }
  }
  return null;
}

function toDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return iso.slice(0, 10);
  } catch {
    return "";
  }
}

function fromDateOnly(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  return `${dateStr}T00:00:00.000Z`;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function RequirementDetailPage({ initiatives, onOpenInitiative, onSaved, readOnly }: Props) {
  const { t } = useTranslation();
  const { requirementId } = useParams<{ requirementId: string }>();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
  const [savingLabels, setSavingLabels] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("P2");
  const [editStatus, setEditStatus] = useState<TaskStatus>("NOT_STARTED");
  const [editAssigneeId, setEditAssigneeId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState("");
  const [editTaskType, setEditTaskType] = useState<TaskType | null>(null);
  const [editExternalRef, setEditExternalRef] = useState("");
  const [editAffectedEnv, setEditAffectedEnv] = useState<AffectedEnvironment | "">("");
  const [editDeployStage, setEditDeployStage] = useState<DeployedToStage | "">("");
  const [editDeployDate, setEditDeployDate] = useState("");
  const [workLinks, setWorkLinks] = useState<WorkArtifactLink[]>([]);
  const [designLinks, setDesignLinks] = useState<DesignArtifactLink[]>([]);
  const [repos, setRepos] = useState<RepositoryConnection[]>([]);
  const [workUrl, setWorkUrl] = useState("");
  const [workType, setWorkType] = useState<WorkArtifactType>("PR");
  const [workRepoId, setWorkRepoId] = useState("");
  const [designUrl, setDesignUrl] = useState("");
  const [designProvider, setDesignProvider] = useState<DesignArtifactProvider>("FIGMA");
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

  const found = requirementId ? findRequirement(initiatives, requirementId) : null;

  useEffect(() => {
    if (!found || editing) return;
    const r = found.requirement;
    setEditTitle(r.title);
    setEditDescription(r.description ?? "");
    setEditExternalRef(r.externalRef ?? "");
    setEditPriority(r.priority);
    setEditStatus(r.status ?? "NOT_STARTED");
    setEditAssigneeId(r.assigneeId ?? null);
    setEditDueDate(toDateOnly(r.dueDate));
    setEditTaskType(r.taskType ?? null);
    setEditAffectedEnv(r.affectedEnvironment ?? "");
    setEditDeployStage(r.deployedToStage ?? "");
    setEditDeployDate(toDateOnly(r.deployedAt));
  }, [
    found?.requirement.id,
    editing,
    found?.requirement.title,
    found?.requirement.description,
    found?.requirement.externalRef,
    found?.requirement.priority,
    found?.requirement.status,
    found?.requirement.assigneeId,
    found?.requirement.dueDate,
    found?.requirement.taskType,
    found?.requirement.affectedEnvironment,
    found?.requirement.deployedToStage,
    found?.requirement.deployedAt
  ]);

  useEffect(() => {
    if (!found?.requirement.id) return;
    setLoadingArtifacts(true);
    Promise.all([
      api.getWorkArtifactLinks({ requirementId: found.requirement.id }),
      api.getDesignArtifactLinks({ requirementId: found.requirement.id }),
      api.getRepositoryConnections()
    ])
      .then(([wl, dl, rc]) => {
        setWorkLinks(wl.workArtifactLinks);
        setDesignLinks(dl.designArtifactLinks);
        setRepos(rc.repositoryConnections);
      })
      .catch(() => {})
      .finally(() => setLoadingArtifacts(false));
  }, [found?.requirement.id]);

  useEffect(() => {
    if (editing && users.length === 0) {
      api
        .getUsers()
        .then((res) => setUsers(res.users ?? []))
        .catch(() => {});
    }
  }, [editing]);

  useEffect(() => {
    void api.getMeta().then((meta) => setLabelSuggestions(meta.labelSuggestions ?? [])).catch(() => {});
  }, []);

  const w = useWorkspaceLinkBuilder();

  if (!requirementId) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Missing requirement ID.</p>
        <Link to={w("/product-explorer")} className="text-sky-600 hover:underline">
          {t("productExplorerPage.backTo")}
        </Link>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Requirement not found.</p>
        <Link to={w("/product-explorer")} className="text-sky-600 hover:underline">
          {t("productExplorerPage.backTo")}
        </Link>
      </div>
    );
  }

  const { requirement, initiative, feature } = found;
  const product = initiative.product;
  const isDone = requirement.isDone || requirement.status === "DONE";
  const siblings = (initiative.features ?? [])
    .flatMap((f) => (f.id === feature.id ? (f.requirements ?? []) : []))
    .filter((r) => r.id !== requirement.id);
  const allInFeature = (initiative.features ?? []).find((f) => f.id === feature.id)?.requirements ?? [];
  const currentIndex = allInFeature.findIndex((r) => r.id === requirement.id);
  const prevId = currentIndex > 0 ? allInFeature[currentIndex - 1]?.id ?? null : null;
  const nextId =
    currentIndex >= 0 && currentIndex < allInFeature.length - 1 ? allInFeature[currentIndex + 1]?.id ?? null : null;

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      await api.updateRequirement(requirement.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        externalRef: editExternalRef.trim() || null,
        priority: editPriority,
        status: editStatus,
        isDone: editStatus === "DONE",
        assigneeId: editAssigneeId || null,
        dueDate: fromDateOnly(editDueDate),
        taskType: editTaskType,
        affectedEnvironment: editAffectedEnv || null,
        deployedToStage: editDeployStage || null,
        deployedAt: fromDateOnly(editDeployDate)
      });
      await onSaved?.();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(requirement.title);
    setEditDescription(requirement.description ?? "");
    setEditExternalRef(requirement.externalRef ?? "");
    setEditPriority(requirement.priority);
    setEditStatus(requirement.status ?? "NOT_STARTED");
    setEditAssigneeId(requirement.assigneeId ?? null);
    setEditDueDate(toDateOnly(requirement.dueDate));
    setEditTaskType(requirement.taskType ?? null);
    setEditAffectedEnv(requirement.affectedEnvironment ?? "");
    setEditDeployStage(requirement.deployedToStage ?? "");
    setEditDeployDate(toDateOnly(requirement.deployedAt));
    setEditing(false);
  };

  return (
    <div className="min-h-0">
      {/* Breadcrumb bar – wireframe header */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 sm:text-sm">
          <Link to={w("/product-explorer")} className="hover:text-slate-700">
            {t("productExplorerPage.breadcrumb")}
          </Link>
          <span aria-hidden>/</span>
          <button
            type="button"
            onClick={() => onOpenInitiative(initiative)}
            className="hover:text-sky-600 hover:underline"
          >
            {initiative.title}
          </button>
          <span aria-hidden>/</span>
          <Link to={w(`/features/${feature.id}`)} className="hover:text-sky-600 hover:underline">
            {feature.title}
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-800">
            {editing ? editTitle : requirement.title}
          </span>
        </nav>
      </div>

      {/* Title row: chips + actions (wireframe) */}
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {editing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-xl font-semibold"
                placeholder="Requirement title"
              />
            ) : (
              <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{requirement.title}</h1>
            )}
            <p className="mt-1 text-sm text-slate-500 break-words">
              {product?.name ?? "—"} · {initiative.title} · {feature.title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Priority)}
                  className="w-24 rounded-full border-slate-300 text-xs font-medium"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {formatPriority(p)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                  className={`w-28 rounded-full text-xs font-medium ${
                    editStatus === "DONE" ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === "DONE" ? "Done" : s === "NOT_STARTED" ? "Open" : s === "TESTING" ? "Testing" : "In progress"}
                    </option>
                  ))}
                </Select>
                <Button variant="primary" disabled={saving || !editTitle.trim()} onClick={handleSave}>
                  Save
                </Button>
                <Button variant="secondary" disabled={saving} onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {formatPriority(requirement.priority)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    isDone ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {isDone ? "Done" : requirement.status === "TESTING" ? "Testing" : requirement.status === "NOT_STARTED" ? "Open" : requirement.status === "IN_PROGRESS" ? "In progress" : requirement.status ?? "Open"}
                </span>
                {!readOnly && (
                  <>
                    <Button variant="primary" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={toggling}
                      onClick={async () => {
                        setToggling(true);
                        try {
                          await api.updateRequirement(requirement.id, {
                            isDone: !isDone,
                            status: isDone ? "NOT_STARTED" : "DONE"
                          });
                          await onSaved?.();
                        } finally {
                          setToggling(false);
                        }
                      }}
                    >
                      {isDone ? "Reopen" : "Mark done"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={deleting}
                      onClick={async () => {
                        if (!window.confirm("Delete this requirement?")) return;
                        setDeleting(true);
                        try {
                          await api.deleteRequirement(requirement.id);
                          window.history.back();
                          await onSaved?.();
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main + sidebar — stack on mobile */}
      <div className="flex flex-col gap-6 p-4 lg:flex-row">
        {/* Main column */}
        <div className="order-2 min-w-0 flex-1 space-y-6 lg:order-1">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <Label>{t("requirementDetail.externalRef")}</Label>
            <p className="mt-0.5 text-xs text-slate-500">{t("requirementDetail.externalRefHint")}</p>
            {editing ? (
              <Input
                value={editExternalRef}
                onChange={(e) => setEditExternalRef(e.target.value)}
                className="mt-1.5 font-mono text-sm"
                placeholder="https://..."
              />
            ) : requirement.externalRef ? (
              <p className="mt-1.5 text-sm">
                {isHttpUrl(requirement.externalRef) ? (
                  <a
                    href={requirement.externalRef.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline break-all"
                  >
                    {requirement.externalRef}
                  </a>
                ) : (
                  <span className="font-mono text-slate-700">{requirement.externalRef}</span>
                )}
              </p>
            ) : (
              <p className="mt-1.5 text-sm italic text-slate-400">{t("common.none")}</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t("common.description")}</Label>
              {!readOnly ? (
                <VoiceMicButton
                  mode="field"
                  target={{ requirementId: requirement.id }}
                  onInsertTranscript={(text) => {
                    setEditing(true);
                    setEditDescription((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
                  }}
                />
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{t("requirementDetail.descriptionHint")}</p>
            {editing ? (
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className="mt-1.5"
                placeholder="Detailed acceptance / implementation note..."
              />
            ) : (
              <p className="mt-1.5 text-sm text-slate-600">
                {requirement.description || (
                  <span className="italic text-slate-400">No description</span>
                )}
              </p>
            )}
          </section>

          <AttachmentPanel target={{ requirementId: requirement.id }} readOnly={readOnly} />

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <Label>{t("labels.title")}</Label>
            <p className="mt-0.5 text-xs text-slate-500">{t("labels.requirementHint")}</p>
            <div className="mt-1.5">
              <LabelEditor
                labels={requirement.labels ?? []}
                suggestions={labelSuggestions}
                disabled={savingLabels || readOnly}
                readOnly={readOnly}
                placeholder={t("labels.placeholder")}
                onChange={async (labels) => {
                  setSavingLabels(true);
                  try {
                    await api.updateRequirement(requirement.id, { labels });
                    await onSaved?.();
                  } finally {
                    setSavingLabels(false);
                  }
                }}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Task metadata
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Assignee</Label>
                {editing ? (
                  <Select
                    value={editAssigneeId ?? ""}
                    onChange={(e) => setEditAssigneeId(e.target.value || null)}
                    className="mt-1"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">
                    {requirement.assignee?.name ?? "—"}
                  </p>
                )}
              </div>
              <div>
                <Label>Due date</Label>
                {editing ? (
                  <Input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1 text-sm text-slate-700">
                    {requirement.dueDate ? toDateOnly(requirement.dueDate) : "—"}
                  </p>
                )}
              </div>
              <div>
                <Label>Type</Label>
                {editing ? (
                  <Select
                    value={editTaskType ?? ""}
                    onChange={(e) => setEditTaskType(e.target.value === "" ? null : (e.target.value as TaskType))}
                    className="mt-1"
                  >
                    <option value="">Unspecified</option>
                    <option value="TASK">TASK</option>
                    <option value="SPIKE">SPIKE</option>
                    <option value="QA">QA</option>
                    <option value="DESIGN">DESIGN</option>
                  </Select>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">{requirement.taskType ?? "Unspecified"}</p>
                )}
              </div>
              <div>
                <Label>Feature</Label>
                <p className="mt-1 text-sm">
                  <Link to={w(`/features/${feature.id}`)} className="text-sky-600 hover:underline">
                    {feature.title}
                  </Link>
                </p>
              </div>
              <div>
                <Label>Initiative</Label>
                <p className="mt-1 text-sm">
                  <button
                    type="button"
                    onClick={() => onOpenInitiative(initiative)}
                    className="text-sky-600 hover:underline"
                  >
                    {initiative.title}
                  </button>
                </p>
              </div>
              <div>
                <Label>{t("requirementDetail.affectedEnv")}</Label>
                {editing ? (
                  <Select
                    value={editAffectedEnv}
                    onChange={(e) => setEditAffectedEnv(e.target.value as AffectedEnvironment | "")}
                    className="mt-1"
                  >
                    <option value="">—</option>
                    {AFFECTED_ENVS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">{requirement.affectedEnvironment ?? "—"}</p>
                )}
              </div>
              <div>
                <Label>{t("requirementDetail.deployStage")}</Label>
                {editing ? (
                  <Select
                    value={editDeployStage}
                    onChange={(e) => setEditDeployStage(e.target.value as DeployedToStage | "")}
                    className="mt-1"
                  >
                    <option value="">—</option>
                    {DEPLOY_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">{requirement.deployedToStage ?? "—"}</p>
                )}
              </div>
              <div>
                <Label>{t("requirementDetail.deployedAt")}</Label>
                {editing ? (
                  <Input type="date" value={editDeployDate} onChange={(e) => setEditDeployDate(e.target.value)} className="mt-1" />
                ) : (
                  <p className="mt-1 text-sm text-slate-700">
                    {requirement.deployedAt ? toDateOnly(requirement.deployedAt) : "—"}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-700">{t("requirementDetail.designLinksTitle")}</h2>
            {loadingArtifacts ? <p className="text-xs text-slate-500">{t("common.loading")}</p> : null}
            <ul className="mb-2 space-y-1 text-sm">
              {designLinks.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">{l.provider}</span>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline break-all">
                    {l.url}
                  </a>
                  {!readOnly ? (
                    <Button
                      variant="ghost"
                      type="button"
                      className="h-7 px-2 text-xs text-red-600"
                      onClick={async () => {
                        await api.deleteDesignArtifactLink(l.id);
                        const dl = await api.getDesignArtifactLinks({ requirementId: requirement.id });
                        setDesignLinks(dl.designArtifactLinks);
                        await onSaved?.();
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {!readOnly ? (
              <div className="grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-4 md:items-end">
                <div>
                  <Label>{t("requirementDetail.provider")}</Label>
                  <Select
                    className="mt-1"
                    value={designProvider}
                    onChange={(e) => setDesignProvider(e.target.value as DesignArtifactProvider)}
                  >
                    {DESIGN_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>URL</Label>
                  <Input className="mt-1 font-mono text-xs" value={designUrl} onChange={(e) => setDesignUrl(e.target.value)} placeholder="https://..." />
                </div>
                <Button
                  type="button"
                  disabled={!designUrl.trim()}
                  onClick={async () => {
                    try {
                       
                      new URL(designUrl.trim());
                    } catch {
                      return;
                    }
                    await api.createDesignArtifactLink({
                      requirementId: requirement.id,
                      featureId: null,
                      provider: designProvider,
                      url: designUrl.trim()
                    });
                    setDesignUrl("");
                    const dl = await api.getDesignArtifactLinks({ requirementId: requirement.id });
                    setDesignLinks(dl.designArtifactLinks);
                    await onSaved?.();
                  }}
                >
                  {t("common.add")}
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-700">{t("requirementDetail.codeLinksTitle")}</h2>
            <ul className="mb-2 space-y-1 text-sm">
              {workLinks.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{l.artifactType}</span>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline break-all">
                    {l.url}
                  </a>
                  {!readOnly ? (
                    <Button
                      variant="ghost"
                      type="button"
                      className="h-7 px-2 text-xs text-red-600"
                      onClick={async () => {
                        await api.deleteWorkArtifactLink(l.id);
                        const wl = await api.getWorkArtifactLinks({ requirementId: requirement.id });
                        setWorkLinks(wl.workArtifactLinks);
                        await onSaved?.();
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {!readOnly ? (
              <div className="grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-5 md:items-end">
                <div>
                  <Label>{t("featureDetail.artifactType")}</Label>
                  <Select className="mt-1" value={workType} onChange={(e) => setWorkType(e.target.value as WorkArtifactType)}>
                    {WORK_TYPES.map((wt) => (
                      <option key={wt} value={wt}>
                        {wt}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>{t("featureDetail.artifactUrl")}</Label>
                  <Input className="mt-1 font-mono text-xs" value={workUrl} onChange={(e) => setWorkUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <Label>{t("featureDetail.repositoryOptional")}</Label>
                  <Select className="mt-1" value={workRepoId} onChange={(e) => setWorkRepoId(e.target.value)}>
                    <option value="">{t("featureDetail.noneRepo")}</option>
                    {repos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.owner}/{r.repo}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  disabled={!workUrl.trim()}
                  onClick={async () => {
                    try {
                       
                      new URL(workUrl.trim());
                    } catch {
                      return;
                    }
                    await api.createWorkArtifactLink({
                      requirementId: requirement.id,
                      featureId: null,
                      repositoryConnectionId: workRepoId || null,
                      artifactType: workType,
                      url: workUrl.trim()
                    });
                    setWorkUrl("");
                    const wl = await api.getWorkArtifactLinks({ requirementId: requirement.id });
                    setWorkLinks(wl.workArtifactLinks);
                    await onSaved?.();
                  }}
                >
                  {t("featureDetail.addArtifactLink")}
                </Button>
              </div>
            ) : null}
          </section>

          {siblings.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Other tasks in this feature
              </h2>
              <ul className="space-y-2">
                {siblings.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/50 py-1.5 pl-3 pr-2">
                    <Link to={w(`/requirements/${r.id}`)} className="text-sm font-medium text-sky-600 hover:underline">
                      {r.title}
                    </Link>
                    <Link
                      to={w(`/requirements/${r.id}`)}
                      className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Sidebar – summary first on mobile */}
        <aside className="order-first w-full shrink-0 space-y-4 lg:order-2 lg:w-72">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Summary
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Priority</dt>
                <dd className="font-medium text-slate-800">
                  {editing ? formatPriority(editPriority) : formatPriority(requirement.priority)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">State</dt>
                <dd className="font-medium text-slate-800">
                  {editing
                    ? (editStatus === "DONE" ? "Done" : editStatus === "NOT_STARTED" ? "Open" : editStatus === "TESTING" ? "Testing" : "In progress")
                    : isDone
                      ? "Done"
                      : requirement.status === "TESTING" ? "Testing" : requirement.status === "NOT_STARTED" ? "Open" : requirement.status === "IN_PROGRESS" ? "In progress" : requirement.status ?? "Open"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Type</dt>
                <dd className="font-medium text-slate-800">
                  {editing ? (editTaskType ?? "Unspecified") : (requirement.taskType ?? "Unspecified")}
                </dd>
              </div>
            </dl>
          </div>

          {(prevId || nextId) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Navigate
              </h2>
              <div className="flex gap-2">
                {prevId ? (
                  <Link
                    to={w(`/requirements/${prevId}`)}
                    className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    ← Previous
                  </Link>
                ) : null}
                {nextId ? (
                  <Link
                    to={w(`/requirements/${nextId}`)}
                    className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Next →
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

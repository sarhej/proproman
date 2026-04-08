import { ChevronDown, ChevronRight, ChevronUp, CheckCircle2, Circle, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DndContext, type DragEndEvent, type DragStartEvent,
  PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay
} from "@dnd-kit/core";
import type { Domain, Feature, Initiative, ProductWithHierarchy, Requirement, TopLevelItemType, User } from "../../types/models";
import { api } from "../../lib/api";
import { formatPriority } from "../../lib/format";
import { DomainBadge } from "../ui/DomainBadge";

type Props = {
  products: ProductWithHierarchy[];
  /**
   * Unfiltered hierarchy from the server (parent state before quick filter / labels narrow children).
   * Required for correct feature/initiative reorder API payloads. Defaults to `products` when omitted.
   */
  hierarchyProducts?: ProductWithHierarchy[];
  users: User[];
  domains: Domain[];
  isAdmin: boolean;
  /** Show add-initiative (matches POST /api/initiatives: EDITOR+) */
  canCreateInitiative: boolean;
  /** "initiative" | "epic" for product-row counts and add button (Product Explorer toggle) */
  terminology?: "initiative" | "epic";
  /** Increment (e.g. from parent state) to expand every product / initiative / feature row */
  expandAllSignal?: number;
  /** Increment to collapse all of the above */
  collapseAllSignal?: number;
  /** When non-empty, matching rows stay expanded; products with no filtered children stay collapsed */
  quickFilter?: string;
  currentUserId: string | null;
  onOpenInitiative: (initiative: Initiative) => void;
  onRefresh: () => Promise<void>;
  /** When set, updates merge into local state instead of refetching the whole tree */
  onInitiativeUpdated?: (initiative: Initiative) => void;
  onFeatureUpdated?: (feature: Feature) => void;
  onRequirementUpdated?: (requirement: Requirement) => void;
  /** Merge reordered epics for a product without refetching the tree (avoids flicker after reorder). */
  onProductInitiativesReordered?: (productId: string, initiatives: Initiative[]) => void;
  /** Merge reordered features for an initiative without refetching. */
  onInitiativeFeaturesReordered?: (initiativeId: string, features: Feature[]) => void;
};

function avgImpact(initiative: Initiative): number {
  const impacts = initiative.personaImpacts?.map((p) => p.impact) ?? [];
  if (!impacts.length) return 0;
  return +(impacts.reduce((a, b) => a + b, 0) / impacts.length).toFixed(1);
}

function demandCounts(links: Initiative["demandLinks"]) {
  const counts: Record<string, number> = { B2B2C: 0, B2G2C: 0, INSURER: 0, PARTNER: 0 };
  for (const link of links ?? []) {
    if (link.demand?.partner) {
      counts.PARTNER++;
    } else if (link.demand?.account?.type) {
      const t = link.demand.account.type;
      if (t in counts) counts[t]++;
    }
  }
  return counts;
}

function reqProgress(features: Feature[]) {
  let done = 0;
  let total = 0;
  for (const f of features) {
    for (const r of f.requirements ?? []) {
      total++;
      if (r.isDone) done++;
    }
  }
  return { done, total };
}

/** Stable sibling order (matches API `orderBy: sortOrder, title`). */
function sortSiblingsByOrder<T extends { sortOrder: number; title: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function DemandBadges({ links }: { links: Initiative["demandLinks"] }) {
  const counts = demandCounts(links);
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (!entries.length) return <span className="text-slate-400">-</span>;
  return (
    <span className="flex gap-1">
      {entries.map(([label, count]) => (
        <span key={label} className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
          {label} {count}
        </span>
      ))}
    </span>
  );
}

function StatusBadge({ status, color, statusType }: { status: string; color: string; statusType?: "feature" | "initiative" }) {
  const { t } = useTranslation();
  const label = statusType === "feature" ? t(`featureStatus.${status}`) : statusType === "initiative" ? t(`status.${status}`) : status.replaceAll("_", " ");
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "DONE": return "bg-green-100 text-green-800";
    case "BUSINESS_APPROVAL": return "bg-amber-100 text-amber-800";
    case "IN_PROGRESS": return "bg-blue-100 text-blue-800";
    case "PLANNED": return "bg-amber-100 text-amber-800";
    case "BLOCKED": return "bg-red-100 text-red-800";
    default: return "bg-slate-100 text-slate-600";
  }
}

/** Product Explorer row tint: done = green, in progress = yellow, not started = light blue. */
function explorerInitiativeRowBg(status: string): string {
  switch (status) {
    case "DONE":
      return "bg-emerald-50";
    case "IN_PROGRESS":
      return "bg-yellow-50";
    case "BLOCKED":
      return "bg-red-50";
    case "IDEA":
    case "PLANNED":
    default:
      return "bg-sky-50";
  }
}

function explorerFeatureRowBg(status: string): string {
  switch (status) {
    case "DONE":
      return "bg-emerald-50";
    case "IN_PROGRESS":
    case "BUSINESS_APPROVAL":
      return "bg-yellow-50";
    case "IDEA":
    case "PLANNED":
    default:
      return "bg-sky-50";
  }
}

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  if (!adding) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-800"
        onClick={() => setAdding(true)}
      >
        <Plus size={12} /> {placeholder}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        className="rounded border border-sky-300 px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-sky-400"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && value.trim()) {
            await onAdd(value.trim());
            setValue("");
            setAdding(false);
          }
          if (e.key === "Escape") {
            setValue("");
            setAdding(false);
          }
        }}
      />
      <button
        type="button"
        className="rounded border border-sky-400 bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-sky-600"
        disabled={!value.trim()}
        onClick={async () => {
          if (!value.trim()) return;
          await onAdd(value.trim());
          setValue("");
          setAdding(false);
        }}
      >
        {t("common.save")}
      </button>
      <button
        type="button"
        className="text-[10px] text-slate-400 hover:text-slate-600"
        onClick={() => { setValue(""); setAdding(false); }}
      >
        {t("common.cancel")}
      </button>
    </span>
  );
}

function EditableTitle({
  title,
  onSave,
  className
}: {
  title: string;
  onSave: (newTitle: string) => Promise<void>;
  className?: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  if (!editing) {
    return (
      <span
        className={`cursor-text ${className ?? ""}`}
        onDoubleClick={() => setEditing(true)}
        title={t("common.doubleClickToEdit")}
      >
        {title}
      </span>
    );
  }

  return (
    <input
      autoFocus
      className="rounded border border-sky-300 px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-sky-400"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        if (value.trim() && value.trim() !== title) {
          await onSave(value.trim());
        }
        setEditing(false);
      }}
      onKeyDown={async (e) => {
        if (e.key === "Enter") {
          if (value.trim() && value.trim() !== title) {
            await onSave(value.trim());
          }
          setEditing(false);
        }
        if (e.key === "Escape") {
          setValue(title);
          setEditing(false);
        }
      }}
    />
  );
}

function DeleteBtn({ onDelete, label }: { onDelete: () => Promise<void>; label: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="ml-1 inline-flex opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
      title={`Delete ${label}`}
      onClick={async (e) => {
        e.stopPropagation();
        if (!window.confirm(t("productTree.deleteConfirm", { name: label }))) return;
        await onDelete();
      }}
    >
      <Trash2 size={12} />
    </button>
  );
}

function ReorderArrows({
  index,
  count,
  onMove
}: {
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  if (count < 2) return null;
  return (
    <span
      className="mx-0.5 inline-flex flex-col items-center align-middle text-slate-400"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="rounded p-0 leading-none hover:bg-slate-200 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent"
        disabled={index <= 0}
        title={t("productTree.moveUp")}
        aria-label={t("productTree.moveUp")}
        onClick={() => void onMove(-1)}
      >
        <ChevronUp size={12} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="-mt-0.5 rounded p-0 leading-none hover:bg-slate-200 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent"
        disabled={index >= count - 1}
        title={t("productTree.moveDown")}
        aria-label={t("productTree.moveDown")}
        onClick={() => void onMove(1)}
      >
        <ChevronDown size={12} strokeWidth={2.5} />
      </button>
    </span>
  );
}

function RequirementRow({
  requirement,
  orderedSiblingRequirements,
  isAdmin,
  onRefresh,
  onRequirementUpdated
}: {
  requirement: Requirement;
  orderedSiblingRequirements: Requirement[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onRequirementUpdated?: (r: Requirement) => void;
}) {
  const { t } = useTranslation();
  const refresh = async (res?: { requirement: Requirement }) => {
    if (onRequirementUpdated && res) onRequirementUpdated(res.requirement);
    else await onRefresh();
  };
  const reqIndex = orderedSiblingRequirements.findIndex((r) => r.id === requirement.id);
  async function reorderRequirement(delta: -1 | 1) {
    const idx = orderedSiblingRequirements.findIndex((r) => r.id === requirement.id);
    const ni = idx + delta;
    if (idx < 0 || ni < 0 || ni >= orderedSiblingRequirements.length) return;
    const next = orderedSiblingRequirements.slice();
    const tmp = next[idx]!;
    next[idx] = next[ni]!;
    next[ni] = tmp;
    const updates = next.map((r, i) => ({ id: r.id, sortOrder: i }));
    await api.reorderRequirements(updates);
    await onRefresh();
  }
  return (
    <tr className="group/row border-t border-slate-100 text-xs">
      <td className="py-1.5 pl-16 pr-2">
        <button
          type="button"
          className="mr-1.5 inline-flex"
          disabled={!isAdmin}
          onClick={async () => {
            const res = await api.updateRequirement(requirement.id, { isDone: !requirement.isDone });
            await refresh(res);
          }}
        >
          {requirement.isDone ? (
            <CheckCircle2 size={14} className="text-green-600" />
          ) : (
            <Circle size={14} className="text-slate-400" />
          )}
        </button>
        {isAdmin ? (
          <ReorderArrows index={reqIndex} count={orderedSiblingRequirements.length} onMove={reorderRequirement} />
        ) : null}
        {isAdmin ? (
          <>
            <EditableTitle
              title={requirement.title}
              className={requirement.isDone ? "line-through text-slate-400" : ""}
              onSave={async (newTitle) => {
                const res = await api.updateRequirement(requirement.id, { title: newTitle });
                await refresh(res);
              }}
            />
            <Link to={`/requirements/${requirement.id}`} className="ml-1.5 text-sky-600 hover:underline text-[11px]">
              Open
            </Link>
            <DeleteBtn label={requirement.title} onDelete={async () => { await api.deleteRequirement(requirement.id); await onRefresh(); }} />
          </>
        ) : (
          <Link
            to={`/requirements/${requirement.id}`}
            className={`hover:underline ${requirement.isDone ? "line-through text-slate-400" : "text-slate-800"}`}
          >
            {requirement.title}
          </Link>
        )}
      </td>
      <td />
      <td />
      <td className="px-2 text-center">
        {isAdmin ? (
          <select
            className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
            value={requirement.priority}
            onChange={async (e) => {
              const res = await api.updateRequirement(requirement.id, { priority: e.target.value });
              await refresh(res);
            }}
          >
            <option value="P0">{formatPriority("P0")}</option>
            <option value="P1">{formatPriority("P1")}</option>
            <option value="P2">{formatPriority("P2")}</option>
            <option value="P3">{formatPriority("P3")}</option>
          </select>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
            {formatPriority(requirement.priority)}
          </span>
        )}
      </td>
      <td className="px-2 text-center text-[11px] text-slate-600">
        {requirement.assignee?.name ?? "—"}
      </td>
      <td className="px-2 text-center">
        {isAdmin ? (
          <select
            className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
            value={requirement.status ?? (requirement.isDone ? "DONE" : "NOT_STARTED")}
            onChange={async (e) => {
              const status = e.target.value as "NOT_STARTED" | "IN_PROGRESS" | "TESTING" | "DONE";
              const res = await api.updateRequirement(requirement.id, { status, isDone: status === "DONE" });
              await refresh(res);
            }}
          >
            <option value="NOT_STARTED">{t("common.taskStatus.NOT_STARTED")}</option>
            <option value="IN_PROGRESS">{t("common.taskStatus.IN_PROGRESS")}</option>
            <option value="TESTING">{t("common.taskStatus.TESTING")}</option>
            <option value="DONE">{t("common.taskStatus.DONE")}</option>
          </select>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
            {requirement.isDone
              ? t("common.taskStatus.DONE")
              : (requirement.status && requirement.status !== "NOT_STARTED"
                ? t("common.taskStatus." + requirement.status)
                : t("common.taskStatus.NOT_STARTED"))}
          </span>
        )}
      </td>
      <td />
    </tr>
  );
}

function FeatureRow({
  feature,
  reorderSiblingFeatures,
  users,
  isAdmin,
  onRefresh,
  onFeatureUpdated,
  onRequirementUpdated,
  onInitiativeFeaturesReordered,
  expandAllSignal,
  collapseAllSignal,
  searchActive
}: {
  feature: Feature;
  /** Full sibling list for this initiative (server order); reorder API requires every feature id once. */
  reorderSiblingFeatures: Feature[];
  users: User[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onFeatureUpdated?: (f: Feature) => void;
  onRequirementUpdated?: (r: Requirement) => void;
  onInitiativeFeaturesReordered?: (initiativeId: string, features: Feature[]) => void;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  searchActive?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (expandAllSignal && expandAllSignal > 0) setOpen(true);
  }, [expandAllSignal]);
  useEffect(() => {
    if (collapseAllSignal && collapseAllSignal > 0) setOpen(false);
  }, [collapseAllSignal]);
  const displayOpen = searchActive ? true : open;
  const reqs = sortSiblingsByOrder(feature.requirements ?? []);
  const done = reqs.filter((r) => r.isDone).length;
  const refreshFeature = async (res?: { feature: Feature }) => {
    if (onFeatureUpdated && res) onFeatureUpdated({ ...res.feature, requirements: feature.requirements });
    else await onRefresh();
  };
  const featIndex = reorderSiblingFeatures.findIndex((f) => f.id === feature.id);
  async function reorderFeature(delta: -1 | 1) {
    const idx = reorderSiblingFeatures.findIndex((f) => f.id === feature.id);
    const ni = idx + delta;
    if (idx < 0 || ni < 0 || ni >= reorderSiblingFeatures.length) return;
    const next = reorderSiblingFeatures.slice();
    const tmp = next[idx]!;
    next[idx] = next[ni]!;
    next[ni] = tmp;
    const updates = next.map((f, i) => ({ id: f.id, sortOrder: i }));
    const nextWithSort = next.map((f, i) => ({ ...f, sortOrder: i }));
    onInitiativeFeaturesReordered?.(feature.initiativeId, nextWithSort);
    try {
      await api.reorderFeatures(updates);
    } catch {
      await onRefresh();
    }
  }

  return (
    <>
      <tr
        className={`group/row border-t border-slate-100 text-xs ${explorerFeatureRowBg(feature.status)} hover:brightness-[0.98]`}
      >
        <td className="py-1.5 pl-12 pr-2">
          <button
            type="button"
            className={`mr-1 inline-flex items-center ${searchActive ? "cursor-default text-slate-500" : ""}`}
            title={searchActive ? t("productTree.expandedWhileQuickFilter") : undefined}
            onClick={() => {
              if (searchActive) return;
              setOpen(!open);
            }}
          >
            {displayOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {isAdmin ? (
            <ReorderArrows index={featIndex} count={reorderSiblingFeatures.length} onMove={reorderFeature} />
          ) : null}
          {isAdmin ? (
            <>
              <EditableTitle
                title={feature.title}
                className="font-medium"
                onSave={async (newTitle) => {
                  const res = await api.updateFeature(feature.id, { title: newTitle });
                  await refreshFeature(res);
                }}
              />
              <Link to={`/features/${feature.id}`} className="ml-1.5 text-sky-600 hover:underline text-[11px]">
                Open
              </Link>
              <DeleteBtn label={feature.title} onDelete={async () => { await api.deleteFeature(feature.id); await onRefresh(); }} />
            </>
          ) : (
            <Link to={`/features/${feature.id}`} className="font-medium hover:underline text-slate-800">
              {feature.title}
            </Link>
          )}
        </td>
        <td />
        <td className="px-2 text-center text-[11px]">
          {reqs.length > 0 ? `${done}/${reqs.length}` : "-"}
        </td>
        <td />
        <td className="px-2 text-center text-[11px]">
          {isAdmin ? (
            <select
              className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
              value={feature.ownerId ?? ""}
              onChange={async (e) => {
                const res = await api.updateFeature(feature.id, { ownerId: e.target.value || null });
                await refreshFeature(res);
              }}
            >
              <option value="">{t("common.none")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            feature.owner?.name ?? "-"
          )}
        </td>
        <td className="px-2 text-center">
          {isAdmin ? (
            <select
              className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
              value={feature.status}
              onChange={async (e) => {
                const res = await api.updateFeature(feature.id, { status: e.target.value });
                await refreshFeature(res);
              }}
            >
              <option value="IDEA">{t("featureStatus.IDEA")}</option>
              <option value="PLANNED">{t("featureStatus.PLANNED")}</option>
              <option value="IN_PROGRESS">{t("featureStatus.IN_PROGRESS")}</option>
              <option value="BUSINESS_APPROVAL">{t("featureStatus.BUSINESS_APPROVAL")}</option>
              <option value="DONE">{t("featureStatus.DONE")}</option>
            </select>
          ) : (
            <StatusBadge status={feature.status} color={statusColor(feature.status)} statusType="feature" />
          )}
        </td>
        <td />
      </tr>
      {displayOpen && reqs.map((r) => (
        <RequirementRow
          key={r.id}
          requirement={r}
          orderedSiblingRequirements={reqs}
          isAdmin={isAdmin}
          onRefresh={onRefresh}
          onRequirementUpdated={onRequirementUpdated}
        />
      ))}
      {(displayOpen || reqs.length === 0) && isAdmin ? (
        <tr className="border-t border-slate-50 text-xs">
          <td className="py-1 pl-16 pr-2">
            <InlineAdd
              placeholder={t("productTree.addRequirement")}
              onAdd={async (title) => {
                await api.createRequirement({ featureId: feature.id, title, isDone: false, priority: "P2" });
                await onRefresh();
              }}
            />
          </td>
          <td colSpan={6} />
        </tr>
      ) : null}
    </>
  );
}

function InitiativeRow({
  initiative,
  reorderSiblingInitiatives,
  reorderSiblingFeatures,
  users,
  isAdmin,
  onOpen,
  onRefresh,
  onInitiativeUpdated,
  onFeatureUpdated,
  onRequirementUpdated,
  onProductInitiativesReordered,
  onInitiativeFeaturesReordered,
  isDragOverlay,
  expandAllSignal,
  collapseAllSignal,
  searchActive
}: {
  initiative: Initiative;
  /** Full epic list under this product (reorder / drag payloads). */
  reorderSiblingInitiatives: Initiative[];
  /** Full feature list under this initiative (reorder API). */
  reorderSiblingFeatures: Feature[];
  users: User[];
  isAdmin: boolean;
  onOpen: (initiative: Initiative) => void;
  onRefresh: () => Promise<void>;
  onInitiativeUpdated?: (i: Initiative) => void;
  onFeatureUpdated?: (f: Feature) => void;
  onRequirementUpdated?: (r: Requirement) => void;
  onProductInitiativesReordered?: (productId: string, initiatives: Initiative[]) => void;
  onInitiativeFeaturesReordered?: (initiativeId: string, features: Feature[]) => void;
  isDragOverlay?: boolean;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  searchActive?: boolean;
}) {
  const { t } = useTranslation();
  const refreshInitiative = async (res?: { initiative: Initiative }) => {
    if (onInitiativeUpdated && res) onInitiativeUpdated(res.initiative);
    else await onRefresh();
  };
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isDragOverlay && expandAllSignal && expandAllSignal > 0) setOpen(true);
  }, [expandAllSignal, isDragOverlay]);
  useEffect(() => {
    if (!isDragOverlay && collapseAllSignal && collapseAllSignal > 0) setOpen(false);
  }, [collapseAllSignal, isDragOverlay]);
  const displayOpen = searchActive && !isDragOverlay ? true : open;
  const impact = avgImpact(initiative);
  const progress = reqProgress(initiative.features ?? []);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: initiative.id,
    data: { initiative },
    disabled: !isAdmin
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: initiative.id,
    disabled: !!isDragOverlay
  });
  const mergeRef = (node: HTMLTableRowElement | null) => {
    setNodeRef(node);
    setDroppableRef(node);
  };

  const orderedFeatures = sortSiblingsByOrder(initiative.features ?? []);
  const initReorderIndex = reorderSiblingInitiatives.findIndex((i) => i.id === initiative.id);

  async function reorderInitiative(delta: -1 | 1) {
    const list = reorderSiblingInitiatives;
    const idx = list.findIndex((i) => i.id === initiative.id);
    const ni = idx + delta;
    if (idx < 0 || ni < 0 || ni >= list.length) return;
    const next = list.slice();
    const tmp = next[idx]!;
    next[idx] = next[ni]!;
    next[ni] = tmp;
    const updates = next.map((init, i) => ({ id: init.id, domainId: init.domainId, sortOrder: i }));
    const nextWithSort = next.map((init, i) => ({ ...init, sortOrder: i }));
    onProductInitiativesReordered?.(initiative.productId, nextWithSort);
    try {
      await api.reorderInitiatives(updates);
    } catch {
      await onRefresh();
    }
  }

  const epicBg = explorerInitiativeRowBg(initiative.status);

  return (
    <>
      <tr
        ref={!isDragOverlay ? mergeRef : undefined}
        className={`group/row border-t border-slate-200 text-sm ${epicBg} hover:brightness-[0.98] ${isDragging && !isDragOverlay ? "opacity-30" : ""} ${isDragOverlay ? "bg-white shadow-lg" : ""} ${isOver && !isDragOverlay ? "ring-1 ring-inset ring-sky-300" : ""}`}
      >
        <td className="py-2 pl-8 pr-2">
          {isAdmin ? (
            <span
              {...attributes}
              {...listeners}
              className="mr-1 inline-flex cursor-grab items-center text-slate-400 hover:text-slate-600 active:cursor-grabbing"
            >
              <GripVertical size={14} />
            </span>
          ) : null}
          <button
            type="button"
            className={`mr-1 inline-flex items-center ${searchActive && !isDragOverlay ? "cursor-default text-slate-500" : ""}`}
            title={searchActive && !isDragOverlay ? t("productTree.expandedWhileQuickFilter") : undefined}
            onClick={() => {
              if (searchActive && !isDragOverlay) return;
              setOpen(!open);
            }}
          >
            {displayOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {isAdmin && !isDragOverlay ? (
            <ReorderArrows
              index={initReorderIndex}
              count={reorderSiblingInitiatives.length}
              onMove={reorderInitiative}
            />
          ) : null}
          <button
            type="button"
            className="font-medium hover:text-sky-700 hover:underline"
            onClick={() => onOpen(initiative)}
          >
            {initiative.title}
          </button>
          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${initiative.domain.color}18` }}>
            <DomainBadge name={initiative.domain.name} color={initiative.domain.color} />
          </span>
          {isAdmin ? (
            <DeleteBtn label={initiative.title} onDelete={async () => { await api.deleteInitiative(initiative.id); await onRefresh(); }} />
          ) : null}
        </td>
        <td className="px-2 text-center text-sm font-semibold">{impact || "-"}</td>
        <td className="px-2 text-center text-[11px]">
          {progress.total > 0 ? `${progress.done}/${progress.total}` : "-"}
        </td>
        <td className="px-2">
          <DemandBadges links={initiative.demandLinks} />
        </td>
        <td className="px-2 text-center text-xs">
          {isAdmin ? (
            <select
              className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
              value={initiative.ownerId ?? ""}
              onChange={async (e) => {
                const res = await api.updateInitiative(initiative.id, { ownerId: e.target.value || null });
                await refreshInitiative(res);
              }}
            >
              <option value="">{t("common.none")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            initiative.owner?.name ?? "-"
          )}
        </td>
        <td className="px-2 text-center">
          {isAdmin ? (
            <select
              className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
              value={initiative.status}
              onChange={async (e) => {
                const res = await api.updateInitiative(initiative.id, { status: e.target.value });
                await refreshInitiative(res);
              }}
            >
              <option value="IDEA">{t("status.IDEA")}</option>
              <option value="PLANNED">{t("status.PLANNED")}</option>
              <option value="IN_PROGRESS">{t("status.IN_PROGRESS")}</option>
              <option value="DONE">{t("status.DONE")}</option>
              <option value="BLOCKED">{t("status.BLOCKED")}</option>
            </select>
          ) : (
            <StatusBadge status={initiative.status} color={statusColor(initiative.status)} statusType="initiative" />
          )}
        </td>
        <td />
      </tr>
      {displayOpen &&
        orderedFeatures.map((feature) => (
          <FeatureRow
            key={feature.id}
            feature={feature}
            reorderSiblingFeatures={reorderSiblingFeatures}
            users={users}
            isAdmin={isAdmin}
            onRefresh={onRefresh}
            onFeatureUpdated={onFeatureUpdated}
            onRequirementUpdated={onRequirementUpdated}
            onInitiativeFeaturesReordered={onInitiativeFeaturesReordered}
            expandAllSignal={expandAllSignal}
            collapseAllSignal={collapseAllSignal}
            searchActive={searchActive && !isDragOverlay}
          />
        ))}
      {(displayOpen || (initiative.features ?? []).length === 0) && isAdmin ? (
        <tr className="border-t border-slate-50 text-xs">
          <td className="py-1 pl-12 pr-2">
            <InlineAdd
              placeholder={t("productTree.addFeature")}
              onAdd={async (title) => {
                await api.createFeature(initiative.id, { title, status: "IDEA" });
                await onRefresh();
              }}
            />
          </td>
          <td colSpan={6} />
        </tr>
      ) : null}
    </>
  );
}

function InlineAddInitiative({
  productId,
  domains,
  currentUserId,
  onRefresh,
  addLabel
}: {
  productId: string;
  domains: Domain[];
  currentUserId: string | null;
  onRefresh: () => Promise<void>;
  /** Override collapsed button label (e.g. "Add epic") */
  addLabel?: string;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [domainId, setDomainId] = useState(domains[0]?.id ?? "");

  if (!adding) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-800"
        onClick={() => setAdding(true)}
      >
        <Plus size={12} /> {addLabel ?? t("productTree.addInitiative")}
      </button>
    );
  }

  async function submit() {
    if (!title.trim() || !domainId) return;
    await api.createInitiative({
      title: title.trim(),
      productId,
      domainId,
      ownerId: currentUserId ?? undefined,
      priority: "P2",
      horizon: "NEXT",
      status: "IDEA",
      commercialType: "CONTRACT_ENABLER",
      isEpic: true,
    });
    setTitle("");
    setAdding(false);
    await onRefresh();
  }

  const canSubmit = title.trim() && domainId;

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        className="rounded border border-sky-300 px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-sky-400"
        placeholder={t("productTree.addInitiative")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter") await submit();
          if (e.key === "Escape") { setTitle(""); setAdding(false); }
        }}
      />
      <select
        className="rounded border border-sky-300 px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-sky-400"
        value={domainId}
        onChange={(e) => setDomainId(e.target.value)}
      >
        <option value="" disabled>{t("productTree.selectDomain")}</option>
        {domains.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="rounded border border-sky-400 bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!canSubmit}
        onClick={async () => await submit()}
      >
        {t("common.save")}
      </button>
      <button
        type="button"
        className="text-[10px] text-slate-400 hover:text-slate-600"
        onClick={() => { setTitle(""); setAdding(false); }}
      >
        {t("common.cancel")}
      </button>
    </span>
  );
}

function ProductRow({
  product,
  hierarchySource,
  users,
  domains,
  isAdmin,
  canCreateInitiative,
  terminology = "initiative",
  currentUserId,
  onOpenInitiative,
  onRefresh,
  onInitiativeUpdated,
  onFeatureUpdated,
  onRequirementUpdated,
  onProductInitiativesReordered,
  onInitiativeFeaturesReordered,
  expandAllSignal,
  collapseAllSignal,
  searchActive
}: {
  product: ProductWithHierarchy;
  hierarchySource: ProductWithHierarchy[];
  users: User[];
  domains: Domain[];
  isAdmin: boolean;
  canCreateInitiative: boolean;
  terminology?: "initiative" | "epic";
  currentUserId: string | null;
  onOpenInitiative: (initiative: Initiative) => void;
  onRefresh: () => Promise<void>;
  onInitiativeUpdated?: (i: Initiative) => void;
  onFeatureUpdated?: (f: Feature) => void;
  onRequirementUpdated?: (r: Requirement) => void;
  onProductInitiativesReordered?: (productId: string, initiatives: Initiative[]) => void;
  onInitiativeFeaturesReordered?: (initiativeId: string, features: Feature[]) => void;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  searchActive?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (expandAllSignal && expandAllSignal > 0) setOpen(true);
  }, [expandAllSignal]);
  useEffect(() => {
    if (collapseAllSignal && collapseAllSignal > 0) setOpen(false);
  }, [collapseAllSignal]);
  const hasFilteredChildren = product.initiatives.length > 0;
  const displayOpen = searchActive ? hasFilteredChildren : open;
  const { setNodeRef, isOver } = useDroppable({ id: `product-${product.id}` });
  const allImpacts = product.initiatives.flatMap((i) => i.personaImpacts?.map((p) => p.impact) ?? []);
  const avgProductImpact = allImpacts.length ? +(allImpacts.reduce((a, b) => a + b, 0) / allImpacts.length).toFixed(1) : 0;
  const allDemandLinks = product.initiatives.flatMap((i) => i.demandLinks ?? []);
  const progress = product.initiatives.reduce(
    (acc, i) => {
      const p = reqProgress(i.features);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 }
  );
  const sourceProduct = hierarchySource.find((p) => p.id === product.id) ?? product;
  const reorderInitiativesList = sortSiblingsByOrder(sourceProduct.initiatives);
  const displayInitiatives = sortSiblingsByOrder(product.initiatives);

  return (
    <>
      <tr
        ref={setNodeRef}
        className={`group/row border-t-2 border-slate-300 text-sm font-semibold transition-colors ${isOver ? "bg-sky-100" : "bg-slate-50"}`}
      >
        <td className="py-2.5 pl-2 pr-2">
          <button
            type="button"
            className={`mr-1 inline-flex items-center ${searchActive ? "cursor-default text-slate-500" : ""}`}
            title={searchActive ? t("productTree.expandedWhileQuickFilter") : undefined}
            onClick={() => {
              if (searchActive) return;
              setOpen(!open);
            }}
          >
            {displayOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {isAdmin ? (
            <EditableTitle
              title={product.name}
              onSave={async (newName) => {
                await api.updateProduct(product.id, { name: newName });
                await onRefresh();
              }}
            />
          ) : (
            product.name
          )}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {product.initiatives.length}{" "}
            {product.initiatives.length === 1
              ? terminology === "epic"
                ? t("productTree.epicLabel")
                : t("productTree.initiativeLabel")
              : terminology === "epic"
                ? t("productTree.epicLabelPlural")
                : t("productTree.initiativeLabelPlural")}
          </span>
          {canCreateInitiative && product.initiatives.length === 0 ? (
            <span className="ml-2 inline-flex items-center align-middle">
              <InlineAddInitiative
                productId={product.id}
                domains={domains}
                currentUserId={currentUserId}
                onRefresh={onRefresh}
                addLabel={terminology === "epic" ? t("productTree.addEpic") : undefined}
              />
            </span>
          ) : null}
          {isAdmin ? (
            <DeleteBtn label={product.name} onDelete={async () => { await api.deleteProduct(product.id); await onRefresh(); }} />
          ) : null}
        </td>
        <td className="px-2 text-center">{avgProductImpact || "-"}</td>
        <td className="px-2 text-center text-xs">
          {progress.total > 0 ? `${progress.done}/${progress.total}` : "-"}
        </td>
        <td className="px-2">
          <DemandBadges links={allDemandLinks} />
        </td>
        <td />
        <td />
        <td className="px-2 align-top text-[11px] text-slate-600">
          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
            {t(`topLevelItem.${((product.itemType ?? "PRODUCT") as TopLevelItemType).toLowerCase()}`)}
          </span>
          {isAdmin ? (
            <select
              className="mt-1 block w-full max-w-[9rem] rounded border border-slate-200 px-1 py-0.5 text-[10px]"
              value={product.itemType ?? "PRODUCT"}
              onChange={async (e) => {
                await api.updateProduct(product.id, { itemType: e.target.value as TopLevelItemType });
                await onRefresh();
              }}
            >
              <option value="PRODUCT">{t("topLevelItem.product")}</option>
              <option value="SYSTEM">{t("topLevelItem.system")}</option>
            </select>
          ) : null}
          <div className="mt-2 flex flex-col gap-1">
            {(product.executionBoards?.length ?? 0) > 0 ? (
              <>
                <span className="text-[10px] text-slate-500">
                  {(product.executionBoards ?? []).find((b) => b.isDefault)?.provider ??
                    product.executionBoards![0]!.provider}{" "}
                  ·{" "}
                  {(product.executionBoards ?? []).find((b) => b.isDefault)?.syncState ??
                    product.executionBoards![0]!.syncState}
                </span>
                <Link to={`/products/${product.id}/execution-board`} className="text-sky-600 hover:underline">
                  {t("executionBoard.openBoard")}
                </Link>
                {canCreateInitiative ? (
                  <Link to={`/products/${product.id}/board-settings`} className="text-sky-600 hover:underline">
                    {t("executionBoard.boardSettings")}
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <span className="text-[10px] text-amber-800">{t("executionBoard.noBoardShort")}</span>
                {canCreateInitiative ? (
                  <button
                    type="button"
                    className="text-left text-[11px] text-sky-600 hover:underline"
                    onClick={async () => {
                      await api.createExecutionBoard(product.id, { name: t("executionBoard.defaultBoardName") });
                      await onRefresh();
                    }}
                  >
                    {t("executionBoard.createBoard")}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </td>
      </tr>
      {displayOpen &&
        displayInitiatives.map((initiative) => {
          const fullInit = sourceProduct.initiatives.find((i) => i.id === initiative.id) ?? initiative;
          const reorderFeatures = sortSiblingsByOrder(fullInit.features ?? []);
          return (
            <InitiativeRow
              key={initiative.id}
              initiative={initiative}
              reorderSiblingInitiatives={reorderInitiativesList}
              reorderSiblingFeatures={reorderFeatures}
              users={users}
              isAdmin={isAdmin}
              onOpen={onOpenInitiative}
              onRefresh={onRefresh}
              onInitiativeUpdated={onInitiativeUpdated}
              onFeatureUpdated={onFeatureUpdated}
              onRequirementUpdated={onRequirementUpdated}
              onProductInitiativesReordered={onProductInitiativesReordered}
              onInitiativeFeaturesReordered={onInitiativeFeaturesReordered}
              expandAllSignal={expandAllSignal}
              collapseAllSignal={collapseAllSignal}
              searchActive={searchActive}
            />
          );
        })}
      {displayOpen && canCreateInitiative && product.initiatives.length > 0 ? (
        <tr className="border-t border-slate-100 text-xs">
          <td className="py-1 pl-8 pr-2">
            <InlineAddInitiative
              productId={product.id}
              domains={domains}
              currentUserId={currentUserId}
              onRefresh={onRefresh}
              addLabel={terminology === "epic" ? t("productTree.addEpic") : undefined}
            />
          </td>
          <td colSpan={6} />
        </tr>
      ) : null}
    </>
  );
}

export function ProductTree({
  products,
  hierarchyProducts,
  users,
  domains,
  isAdmin,
  canCreateInitiative,
  terminology = "initiative",
  expandAllSignal,
  collapseAllSignal,
  quickFilter,
  currentUserId,
  onOpenInitiative,
  onRefresh,
  onInitiativeUpdated,
  onFeatureUpdated,
  onRequirementUpdated,
  onProductInitiativesReordered,
  onInitiativeFeaturesReordered,
  onAddProduct
}: Props & { onAddProduct?: (name: string) => Promise<void> }) {
  const { t } = useTranslation();
  const searchActive = Boolean(quickFilter?.trim());
  const hierarchy = hierarchyProducts ?? products;
  const [draggingInitiative, setDraggingInitiative] = useState<Initiative | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const allInitiatives = hierarchy.flatMap((p) => p.initiatives);

  const dragOverlayReorder =
    draggingInitiative &&
    (() => {
      const op = hierarchy.find((p) => p.initiatives.some((i) => i.id === draggingInitiative.id));
      const rInits = op ? sortSiblingsByOrder(op.initiatives) : [draggingInitiative];
      const full = op?.initiatives.find((i) => i.id === draggingInitiative.id) ?? draggingInitiative;
      return { rInits, rFeats: sortSiblingsByOrder(full.features ?? []) };
    })();

  function handleDragStart(event: DragStartEvent) {
    const initiative = event.active.data.current?.initiative as Initiative | undefined;
    setDraggingInitiative(initiative ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingInitiative(null);
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    const initiative = allInitiatives.find((i) => i.id === active.id);
    if (!initiative) return;

    // Drop on another initiative (same product) → reorder within product (visual order only; priority unchanged)
    if (!overId.startsWith("product-")) {
      const targetInitiative = allInitiatives.find((i) => i.id === overId);
      if (!targetInitiative || initiative.productId !== targetInitiative.productId || initiative.id === targetInitiative.id) return;
      const product = hierarchy.find((p) => p.id === initiative.productId);
      if (!product) return;
      const sorted = product.initiatives.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      const fromIdx = sorted.findIndex((i) => i.id === initiative.id);
      const toIdx = sorted.findIndex((i) => i.id === targetInitiative.id);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const reordered = sorted.filter((i) => i.id !== initiative.id);
      reordered.splice(toIdx, 0, initiative);
      const updates = reordered.map((init, i) => ({ id: init.id, domainId: init.domainId, sortOrder: i }));
      const nextWithSort = reordered.map((init, i) => ({ ...init, sortOrder: i }));
      onProductInitiativesReordered?.(product.id, nextWithSort);
      try {
        await api.reorderInitiatives(updates);
      } catch {
        await onRefresh();
      }
      return;
    }

    // Drop on product → move initiative to that product
    const targetProductId = overId.replace("product-", "");
    if (initiative.productId === targetProductId) return;
    await api.updateInitiative(initiative.id, { productId: targetProductId });
    await onRefresh();
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[1040px] text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase text-slate-500">
              <th className="px-2 py-2">{t("common.name")}</th>
              <th className="px-2 py-2 text-center">{t("productTree.impact")}</th>
              <th className="px-2 py-2 text-center">{t("productTree.progress")}</th>
              <th className="px-2 py-2">{t("demands.title")}</th>
              <th className="px-2 py-2 text-center">{t("initiative.owner")}</th>
              <th className="px-2 py-2 text-center">{t("common.status")}</th>
              <th className="px-2 py-2 w-[200px]">{t("executionBoard.deliveryColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                hierarchySource={hierarchy}
                users={users}
                domains={domains}
                isAdmin={isAdmin}
                canCreateInitiative={canCreateInitiative}
                terminology={terminology}
                expandAllSignal={expandAllSignal}
                collapseAllSignal={collapseAllSignal}
                searchActive={searchActive}
                currentUserId={currentUserId}
                onOpenInitiative={onOpenInitiative}
                onRefresh={onRefresh}
                onInitiativeUpdated={onInitiativeUpdated}
                onFeatureUpdated={onFeatureUpdated}
                onRequirementUpdated={onRequirementUpdated}
                onProductInitiativesReordered={onProductInitiativesReordered}
                onInitiativeFeaturesReordered={onInitiativeFeaturesReordered}
              />
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t("productTree.empty")}
                </td>
              </tr>
            )}
            {isAdmin && onAddProduct ? (
              <tr className="border-t border-slate-200">
                <td className="py-2 pl-2 pr-2">
                  <InlineAdd placeholder={t("productTree.addProduct")} onAdd={onAddProduct} />
                </td>
                <td colSpan={6} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <DragOverlay>
        {draggingInitiative && dragOverlayReorder ? (
          <table className="w-full text-left">
            <tbody>
              <InitiativeRow
                initiative={draggingInitiative}
                reorderSiblingInitiatives={dragOverlayReorder.rInits}
                reorderSiblingFeatures={dragOverlayReorder.rFeats}
                users={users}
                isAdmin={false}
                onOpen={() => {}}
                onRefresh={async () => {}}
                isDragOverlay
              />
            </tbody>
          </table>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

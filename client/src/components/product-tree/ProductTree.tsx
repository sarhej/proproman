import { ChevronDown, ChevronRight, CheckCircle2, Circle, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext, type DragEndEvent, type DragStartEvent,
  PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay
} from "@dnd-kit/core";
import type { Domain, Feature, Initiative, ProductWithHierarchy, Requirement, User } from "../../types/models";
import { api } from "../../lib/api";
import { formatPriority } from "../../lib/format";
import { DomainBadge } from "../ui/DomainBadge";

type Props = {
  products: ProductWithHierarchy[];
  users: User[];
  domains: Domain[];
  isAdmin: boolean;
  currentUserId: string | null;
  onOpenInitiative: (initiative: Initiative) => void;
  onRefresh: () => Promise<void>;
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
    case "IN_PROGRESS": return "bg-blue-100 text-blue-800";
    case "PLANNED": return "bg-amber-100 text-amber-800";
    case "BLOCKED": return "bg-red-100 text-red-800";
    default: return "bg-slate-100 text-slate-600";
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

function RequirementRow({
  requirement,
  isAdmin,
  onRefresh
}: {
  requirement: Requirement;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <tr className="group/row border-t border-slate-100 text-xs">
      <td className="py-1.5 pl-16 pr-2">
        <button
          type="button"
          className="mr-1.5 inline-flex"
          disabled={!isAdmin}
          onClick={async () => {
            await api.updateRequirement(requirement.id, { isDone: !requirement.isDone });
            await onRefresh();
          }}
        >
          {requirement.isDone ? (
            <CheckCircle2 size={14} className="text-green-600" />
          ) : (
            <Circle size={14} className="text-slate-400" />
          )}
        </button>
        {isAdmin ? (
          <EditableTitle
            title={requirement.title}
            className={requirement.isDone ? "line-through text-slate-400" : ""}
            onSave={async (newTitle) => {
              await api.updateRequirement(requirement.id, { title: newTitle });
              await onRefresh();
            }}
          />
        ) : (
          <span className={requirement.isDone ? "line-through text-slate-400" : ""}>{requirement.title}</span>
        )}
        {isAdmin ? (
          <DeleteBtn label={requirement.title} onDelete={async () => { await api.deleteRequirement(requirement.id); await onRefresh(); }} />
        ) : null}
      </td>
      <td />
      <td />
      <td className="px-2 text-center">
        {isAdmin ? (
          <select
            className="rounded border border-slate-200 px-1 py-0.5 text-[10px]"
            value={requirement.priority}
            onChange={async (e) => {
              await api.updateRequirement(requirement.id, { priority: e.target.value });
              await onRefresh();
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
      <td />
      <td className="px-2 text-center">{requirement.isDone ? t("common.done") : t("common.open")}</td>
    </tr>
  );
}

function FeatureRow({
  feature,
  users,
  isAdmin,
  onRefresh
}: {
  feature: Feature;
  users: User[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const reqs = feature.requirements ?? [];
  const done = reqs.filter((r) => r.isDone).length;

  return (
    <>
      <tr className="group/row border-t border-slate-100 text-xs hover:bg-slate-50">
        <td className="py-1.5 pl-12 pr-2">
          <button type="button" className="mr-1 inline-flex items-center" onClick={() => setOpen(!open)}>
            {reqs.length > 0 ? (
              open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="inline-block w-[14px]" />
            )}
          </button>
          {isAdmin ? (
            <EditableTitle
              title={feature.title}
              className="font-medium"
              onSave={async (newTitle) => {
                await api.updateFeature(feature.id, { title: newTitle });
                await onRefresh();
              }}
            />
          ) : (
            <span className="font-medium">{feature.title}</span>
          )}
          {isAdmin ? (
            <DeleteBtn label={feature.title} onDelete={async () => { await api.deleteFeature(feature.id); await onRefresh(); }} />
          ) : null}
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
                await api.updateFeature(feature.id, { ownerId: e.target.value || null });
                await onRefresh();
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
                await api.updateFeature(feature.id, { status: e.target.value });
                await onRefresh();
              }}
            >
              <option value="IDEA">{t("featureStatus.IDEA")}</option>
              <option value="PLANNED">{t("featureStatus.PLANNED")}</option>
              <option value="IN_PROGRESS">{t("featureStatus.IN_PROGRESS")}</option>
              <option value="DONE">{t("featureStatus.DONE")}</option>
            </select>
          ) : (
            <StatusBadge status={feature.status} color={statusColor(feature.status)} statusType="feature" />
          )}
        </td>
      </tr>
      {open && reqs.map((r) => (
        <RequirementRow key={r.id} requirement={r} isAdmin={isAdmin} onRefresh={onRefresh} />
      ))}
      {open && isAdmin ? (
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
          <td colSpan={5} />
        </tr>
      ) : null}
    </>
  );
}

function InitiativeRow({
  initiative,
  users,
  isAdmin,
  onOpen,
  onRefresh,
  isDragOverlay
}: {
  initiative: Initiative;
  users: User[];
  isAdmin: boolean;
  onOpen: (initiative: Initiative) => void;
  onRefresh: () => Promise<void>;
  isDragOverlay?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const impact = avgImpact(initiative);
  const progress = reqProgress(initiative.features);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: initiative.id,
    data: { initiative },
    disabled: !isAdmin
  });

  return (
    <>
      <tr
        ref={!isDragOverlay ? setNodeRef : undefined}
        className={`group/row border-t border-slate-200 text-sm hover:bg-slate-50 ${isDragging && !isDragOverlay ? "opacity-30" : ""} ${isDragOverlay ? "bg-white shadow-lg" : ""}`}
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
          <button type="button" className="mr-1 inline-flex items-center" onClick={() => setOpen(!open)}>
            {initiative.features.length > 0 ? (
              open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="inline-block w-[14px]" />
            )}
          </button>
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
                await api.updateInitiative(initiative.id, { ownerId: e.target.value || null });
                await onRefresh();
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
                await api.updateInitiative(initiative.id, { status: e.target.value });
                await onRefresh();
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
      </tr>
      {open && initiative.features.map((feature) => (
        <FeatureRow key={feature.id} feature={feature} users={users} isAdmin={isAdmin} onRefresh={onRefresh} />
      ))}
      {open && isAdmin ? (
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
          <td colSpan={5} />
        </tr>
      ) : null}
    </>
  );
}

function InlineAddInitiative({
  productId,
  domains,
  currentUserId,
  onRefresh
}: {
  productId: string;
  domains: Domain[];
  currentUserId: string | null;
  onRefresh: () => Promise<void>;
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
        <Plus size={12} /> {t("productTree.addInitiative")}
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
  users,
  domains,
  isAdmin,
  currentUserId,
  onOpenInitiative,
  onRefresh
}: {
  product: ProductWithHierarchy;
  users: User[];
  domains: Domain[];
  isAdmin: boolean;
  currentUserId: string | null;
  onOpenInitiative: (initiative: Initiative) => void;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
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

  return (
    <>
      <tr
        ref={setNodeRef}
        className={`group/row border-t-2 border-slate-300 text-sm font-semibold transition-colors ${isOver ? "bg-sky-100" : "bg-slate-50"}`}
      >
        <td className="py-2.5 pl-2 pr-2">
          <button type="button" className="mr-1 inline-flex items-center" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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
            {product.initiatives.length} initiative{product.initiatives.length !== 1 ? "s" : ""}
          </span>
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
      </tr>
      {open && product.initiatives.map((initiative) => (
        <InitiativeRow
          key={initiative.id}
          initiative={initiative}
          users={users}
          isAdmin={isAdmin}
          onOpen={onOpenInitiative}
          onRefresh={onRefresh}
        />
      ))}
      {open && isAdmin ? (
        <tr className="border-t border-slate-100 text-xs">
          <td className="py-1 pl-8 pr-2">
            <InlineAddInitiative
              productId={product.id}
              domains={domains}
              currentUserId={currentUserId}
              onRefresh={onRefresh}
            />
          </td>
          <td colSpan={5} />
        </tr>
      ) : null}
    </>
  );
}

export function ProductTree({
  products,
  users,
  domains,
  isAdmin,
  currentUserId,
  onOpenInitiative,
  onRefresh,
  onAddProduct
}: Props & { onAddProduct?: (name: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [draggingInitiative, setDraggingInitiative] = useState<Initiative | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const allInitiatives = products.flatMap((p) => p.initiatives);

  function handleDragStart(event: DragStartEvent) {
    const initiative = event.active.data.current?.initiative as Initiative | undefined;
    setDraggingInitiative(initiative ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingInitiative(null);
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    if (!overId.startsWith("product-")) return;

    const targetProductId = overId.replace("product-", "");
    const initiative = allInitiatives.find((i) => i.id === active.id);
    if (!initiative || initiative.productId === targetProductId) return;

    await api.updateInitiative(initiative.id, { productId: targetProductId });
    await onRefresh();
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase text-slate-500">
              <th className="px-2 py-2">{t("common.name")}</th>
              <th className="px-2 py-2 text-center">{t("productTree.impact")}</th>
              <th className="px-2 py-2 text-center">{t("productTree.progress")}</th>
              <th className="px-2 py-2">{t("demands.title")}</th>
              <th className="px-2 py-2 text-center">{t("initiative.owner")}</th>
              <th className="px-2 py-2 text-center">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                users={users}
                domains={domains}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onOpenInitiative={onOpenInitiative}
                onRefresh={onRefresh}
              />
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t("productTree.empty")}
                </td>
              </tr>
            )}
            {isAdmin && onAddProduct ? (
              <tr className="border-t border-slate-200">
                <td className="py-2 pl-2 pr-2">
                  <InlineAdd placeholder={t("productTree.addProduct")} onAdd={onAddProduct} />
                </td>
                <td colSpan={5} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <DragOverlay>
        {draggingInitiative ? (
          <table className="w-full text-left">
            <tbody>
              <InitiativeRow
                initiative={draggingInitiative}
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

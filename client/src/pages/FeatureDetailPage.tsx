import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Feature, Initiative } from "../types/models";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";

type Props = {
  initiatives: Initiative[];
  onOpenInitiative: (initiative: Initiative) => void;
  onSaved?: () => Promise<void>;
  onFeatureUpdated?: (feature: Feature) => void;
  readOnly?: boolean;
};

function findFeature(initiatives: Initiative[], featureId: string): { feature: Feature; initiative: Initiative } | null {
  for (const init of initiatives) {
    const feature = init.features?.find((f) => f.id === featureId);
    if (feature) return { feature, initiative: init };
  }
  return null;
}

export function FeatureDetailPage({ initiatives, onOpenInitiative, onSaved, onFeatureUpdated, readOnly }: Props) {
  const { t } = useTranslation();
  const { featureId } = useParams<{ featureId: string }>();
  const [newReqTitle, setNewReqTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const found = featureId ? findFeature(initiatives, featureId) : null;

  if (!featureId) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Missing feature ID.</p>
        <Link to="/product-explorer" className="text-sky-600 hover:underline">
          Back to Product Explorer
        </Link>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Feature not found.</p>
        <Link to="/product-explorer" className="text-sky-600 hover:underline">
          Back to Product Explorer
        </Link>
      </div>
    );
  }

  const { feature, initiative } = found;
  const product = initiative.product;
  const requirementCount = feature.requirements?.length ?? 0;
  const doneCount = feature.requirements?.filter((r) => r.isDone || r.status === "DONE").length ?? 0;

  const startEditTitle = () => {
    setEditTitleValue(feature.title);
    setEditingTitle(true);
  };
  const saveTitle = async () => {
    if (!editTitleValue.trim() || editTitleValue === feature.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await api.updateFeature(feature.id, { title: editTitleValue.trim() });
      setEditingTitle(false);
      onFeatureUpdated?.({ ...res.feature, requirements: feature.requirements ?? res.feature.requirements ?? [] });
      await onSaved?.();
    } finally {
      setSavingTitle(false);
    }
  };
  const cancelEditTitle = () => {
    setEditTitleValue(feature.title);
    setEditingTitle(false);
  };

  return (
    <div className="space-y-4 p-4">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/product-explorer" className="hover:text-slate-700">
          Product Explorer
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
        {editingTitle ? (
          <span className="font-medium text-slate-800">{editTitleValue || feature.title}</span>
        ) : (
          <span className="font-medium text-slate-800">{feature.title}</span>
        )}
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                className="text-xl font-semibold flex-1 min-w-[200px]"
                placeholder="Feature title"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveTitle();
                  if (e.key === "Escape") cancelEditTitle();
                }}
              />
              <Button onClick={saveTitle} disabled={savingTitle || !editTitleValue.trim()}>
                Save
              </Button>
              <Button variant="ghost" onClick={cancelEditTitle} disabled={savingTitle}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900">{feature.title}</h1>
              {!readOnly && (
                <button
                  type="button"
                  onClick={startEditTitle}
                  className="mt-1 text-sm text-slate-500 hover:text-sky-600 hover:underline"
                >
                  Edit title
                </button>
              )}
            </>
          )}
          <p className="mt-1 text-sm text-slate-500">
            {product?.name ?? "—"} · {initiative.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {t(`featureStatus.${feature.status}`)}
          </span>
          {!readOnly && !editingTitle && (
            <Button variant="secondary" onClick={() => onOpenInitiative(initiative)}>
              Open initiative
            </Button>
          )}
        </div>
      </div>

      {feature.description ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Description</h2>
          <p className="text-sm text-slate-600">{feature.description}</p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Requirements ({doneCount}/{requirementCount})
        </h2>
        <ul className="space-y-1">
          {(feature.requirements ?? []).map((req) => (
            <li key={req.id} className="flex items-center gap-2 text-sm">
              <Link
                to={`/requirements/${req.id}`}
                className="text-sky-600 hover:underline"
              >
                {req.title}
              </Link>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {req.priority}
              </span>
              {(req.isDone || req.status === "DONE") ? (
                <span className="text-green-600" aria-label="Done">✓</span>
              ) : null}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="mt-3 flex gap-2">
            <Input
              value={newReqTitle}
              onChange={(e) => setNewReqTitle(e.target.value)}
              placeholder="New requirement title..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!newReqTitle.trim()) return;
                  setAdding(true);
                  api
                    .createRequirement({ featureId: feature.id, title: newReqTitle.trim(), isDone: false, priority: "P2" })
                    .then(() => {
                      setNewReqTitle("");
                      return onSaved?.();
                    })
                    .finally(() => setAdding(false));
                }
              }}
            />
            <Button
              disabled={!newReqTitle.trim() || adding}
              onClick={async () => {
                if (!newReqTitle.trim()) return;
                setAdding(true);
                try {
                  await api.createRequirement({
                    featureId: feature.id,
                    title: newReqTitle.trim(),
                    isDone: false,
                    priority: "P2"
                  });
                  setNewReqTitle("");
                  await onSaved?.();
                } finally {
                  setAdding(false);
                }
              }}
            >
              Add requirement
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

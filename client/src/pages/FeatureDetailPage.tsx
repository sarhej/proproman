import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useWorkspaceLinkBuilder } from "../hooks/useWorkspaceHref";
import { api } from "../lib/api";
import type { Feature, Initiative } from "../types/models";
import { Button } from "../components/ui/Button";
import { Input, Label, Textarea } from "../components/ui/Field";
import { LabelEditor } from "../components/ui/LabelEditor";

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
  const w = useWorkspaceLinkBuilder();
  const [newReqTitle, setNewReqTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editAC, setEditAC] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
  const [savingLabels, setSavingLabels] = useState(false);
  const found = featureId ? findFeature(initiatives, featureId) : null;
  const featureForSync = found?.feature ?? null;

  useEffect(() => {
    void api.getMeta().then((meta) => setLabelSuggestions(meta.labelSuggestions ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!featureForSync || editingDetails) return;
    setEditDesc(featureForSync.description ?? "");
    setEditAC(featureForSync.acceptanceCriteria ?? "");
  }, [
    featureForSync?.id,
    featureForSync?.description,
    featureForSync?.acceptanceCriteria,
    editingDetails
  ]);

  if (!featureId) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Missing feature ID.</p>
        <Link to={w("/product-explorer")} className="text-sky-600 hover:underline">
          {t("productExplorerPage.backTo")}
        </Link>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Feature not found.</p>
        <Link to={w("/product-explorer")} className="text-sky-600 hover:underline">
          {t("productExplorerPage.backTo")}
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

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{t("featureDetail.description")}</h2>
          {!readOnly && !editingDetails ? (
            <Button variant="secondary" type="button" onClick={() => setEditingDetails(true)}>
              {t("featureDetail.editDetails")}
            </Button>
          ) : null}
        </div>
        {editingDetails && !readOnly ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-slate-500">{t("featureDetail.descriptionHint")}</p>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label>{t("featureDetail.acceptanceCriteria")}</Label>
              <p className="mb-1 text-xs text-slate-500">{t("featureDetail.acceptanceCriteriaHint")}</p>
              <Textarea
                value={editAC}
                onChange={(e) => setEditAC(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={savingDetails}
                onClick={async () => {
                  setSavingDetails(true);
                  try {
                    const res = await api.updateFeature(feature.id, {
                      description: editDesc.trim() || null,
                      acceptanceCriteria: editAC.trim() || null
                    });
                    onFeatureUpdated?.({
                      ...res.feature,
                      requirements: feature.requirements ?? res.feature.requirements ?? []
                    });
                    setEditingDetails(false);
                    await onSaved?.();
                  } finally {
                    setSavingDetails(false);
                  }
                }}
              >
                {t("featureDetail.saveDetails")}
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={savingDetails}
                onClick={() => {
                  setEditDesc(feature.description ?? "");
                  setEditAC(feature.acceptanceCriteria ?? "");
                  setEditingDetails(false);
                }}
              >
                {t("featureDetail.cancelEdit")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <div>
              {feature.description ? (
                <p className="whitespace-pre-wrap">{feature.description}</p>
              ) : (
                <p className="italic text-slate-400">{t("common.none")}</p>
              )}
            </div>
            <div>
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("featureDetail.acceptanceCriteria")}
              </p>
              {feature.acceptanceCriteria ? (
                <p className="whitespace-pre-wrap">{feature.acceptanceCriteria}</p>
              ) : (
                <p className="italic text-slate-400">{t("common.none")}</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">{t("labels.title")}</h2>
            <p className="text-xs text-slate-500">{t("labels.featureHint")}</p>
          </div>
        </div>
        <LabelEditor
          labels={feature.labels ?? []}
          suggestions={labelSuggestions}
          disabled={savingLabels || readOnly}
          readOnly={readOnly}
          placeholder={t("labels.placeholder")}
          onChange={async (labels) => {
            setSavingLabels(true);
            try {
              const res = await api.updateFeature(feature.id, { labels });
              onFeatureUpdated?.({
                ...res.feature,
                requirements: feature.requirements ?? res.feature.requirements ?? []
              });
              await onSaved?.();
            } finally {
              setSavingLabels(false);
            }
          }}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Requirements ({doneCount}/{requirementCount})
        </h2>
        <ul className="space-y-1">
          {(feature.requirements ?? []).map((req) => (
            <li key={req.id} className="flex items-center gap-2 text-sm">
              <Link
                to={w(`/requirements/${req.id}`)}
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

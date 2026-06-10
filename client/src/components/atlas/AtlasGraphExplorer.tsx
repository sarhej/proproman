import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Card } from "../ui/Card";
import { Input, Label } from "../ui/Field";
import {
  NO_PRODUCT_ID,
  buildDomainTree,
  buildTopicGraph,
  filterDomainTree,
  findSelectionLabel,
  findSelectionStatus,
  selectionObjectType,
  type AtlasGraphPayload,
  type GraphNodeKind,
  type GraphSelection
} from "./atlasGraphModel";

type ObjectShardPayload = {
  facts: Record<string, unknown>;
  graph?: {
    links?: Record<string, unknown>;
    edges?: Array<{ kind: string; targetType: string; targetId: string }>;
  };
  provenance: { materializedAt: string; sourceUpdatedAt: string };
};

type Props = {
  atlas: AtlasGraphPayload;
  onSelectTopicInOverview?: (topicId: string) => void;
};

type OpenState = Record<string, boolean>;

function nodeKey(kind: GraphNodeKind, id: string): string {
  return `${kind}:${id}`;
}

function excerpt(value: unknown, max = 900): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function RowButton({
  active,
  depth,
  label,
  meta,
  onClick
}: {
  active: boolean;
  depth: number;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex w-full items-center justify-between rounded bg-blue-50 px-2 py-1 text-left text-sm text-blue-900"
          : "flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm text-slate-800 hover:bg-slate-50"
      }
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <span className="truncate font-medium">{label}</span>
      {meta ? <span className="ml-2 shrink-0 text-xs text-slate-500">{meta}</span> : null}
    </button>
  );
}

export function AtlasGraphExplorer({ atlas, onSelectTopicInOverview }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [open, setOpen] = useState<OpenState>({});
  const [shard, setShard] = useState<ObjectShardPayload | null>(null);
  const [shardLoading, setShardLoading] = useState(false);
  const [topicEdges, setTopicEdges] = useState<Map<string, string[]>>(new Map());

  const domainTree = useMemo(() => buildDomainTree(atlas), [atlas]);
  const filteredTree = useMemo(() => filterDomainTree(domainTree, search), [domainTree, search]);

  const initiativeTitleById = useMemo(
    () => new Map(atlas.initiativeIndex.map((i) => [i.id, i.title])),
    [atlas.initiativeIndex]
  );

  const topics = useMemo(
    () =>
      buildTopicGraph(atlas.architectureTopicIndex ?? [], initiativeTitleById, topicEdges).filter((topic) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        if (topic.title.toLowerCase().includes(q) || topic.slug.toLowerCase().includes(q)) return true;
        return topic.linkedInitiatives.some((l) => l.initiativeTitle.toLowerCase().includes(q));
      }),
    [atlas.architectureTopicIndex, initiativeTitleById, topicEdges, search]
  );

  useEffect(() => {
    const topicIds = atlas.architectureTopicIndex?.map((t) => t.id) ?? [];
    if (topicIds.length === 0) {
      setTopicEdges(new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(
      topicIds.map(async (id) => {
        try {
          const res = await api.getWorkspaceAtlasObject("ARCHITECTURE_TOPIC", id);
          const s = res.shard as ObjectShardPayload;
          const links = s.graph?.links?.initiativeIds;
          const fromEdges = (s.graph?.edges ?? [])
            .filter((e) => e.targetType === "INITIATIVE")
            .map((e) => e.targetId);
          const ids = Array.isArray(links) ? (links as string[]) : fromEdges;
          return [id, ids] as const;
        } catch {
          return [id, []] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setTopicEdges(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [atlas.architectureTopicIndex]);

  useEffect(() => {
    if (!selection) {
      setShard(null);
      return;
    }
    let cancelled = false;
    setShardLoading(true);
    void api
      .getWorkspaceAtlasObject(selectionObjectType(selection.kind), selection.id)
      .then((res) => {
        if (!cancelled) setShard(res.shard as ObjectShardPayload);
      })
      .catch(() => {
        if (!cancelled) setShard(null);
      })
      .finally(() => {
        if (!cancelled) setShardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const toggleOpen = useCallback((key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const select = useCallback((next: GraphSelection) => {
    setSelection(next);
  }, []);

  const isOpen = (key: string, forceOpen: boolean) => open[key] ?? forceOpen;

  const forceExpand = search.trim().length > 0;

  const selectionLabel = selection ? findSelectionLabel(atlas, selection) : null;
  const selectionStatus = selection ? findSelectionStatus(atlas, selection) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(300px,380px)]">
      <Card className="max-h-[70vh] overflow-auto p-3">
        <div className="mb-3">
          <Label>{t("atlasHub.graphSearch")}</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("atlasHub.graphSearchPlaceholder")}
          />
        </div>

        <h2 className="text-sm font-semibold text-slate-800">{t("atlasHub.graphBacklog")}</h2>
        <ul className="mt-2 space-y-1">
          {filteredTree.map((domain) => {
            const dKey = nodeKey("domain", domain.id);
            const dOpen = isOpen(dKey, forceExpand);
            return (
              <li key={domain.id} className="rounded border border-slate-100">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="px-1 text-xs text-slate-400"
                    onClick={() => toggleOpen(dKey)}
                    aria-label={dOpen ? t("atlasHub.graphCollapse") : t("atlasHub.graphExpand")}
                  >
                    {dOpen ? "▾" : "▸"}
                  </button>
                  <RowButton
                    active={selection?.kind === "domain" && selection.id === domain.id}
                    depth={0}
                    label={domain.name}
                    meta={t(`atlasHub.graphNodeType.domain`)}
                    onClick={() => select({ kind: "domain", id: domain.id })}
                  />
                </div>
                {dOpen ? (
                  <ul className="pb-1">
                    {domain.products.map((product) => {
                      const pKey = nodeKey("product", product.id);
                      const pOpen = isOpen(pKey, forceExpand);
                      const productLabel =
                        product.id === NO_PRODUCT_ID ? t("atlasHub.graphNoProduct") : product.name;
                      return (
                        <li key={product.id}>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="px-1 text-xs text-slate-400"
                              onClick={() => toggleOpen(pKey)}
                              aria-label={pOpen ? t("atlasHub.graphCollapse") : t("atlasHub.graphExpand")}
                            >
                              {pOpen ? "▾" : "▸"}
                            </button>
                            <RowButton
                              active={selection?.kind === "product" && selection.id === product.id}
                              depth={1}
                              label={productLabel}
                              meta={t(`atlasHub.graphNodeType.product`)}
                              onClick={() => select({ kind: "product", id: product.id })}
                            />
                          </div>
                          {pOpen ? (
                            <ul>
                              {product.initiatives.map((init) => {
                                const iKey = nodeKey("initiative", init.id);
                                const iOpen = isOpen(iKey, forceExpand);
                                return (
                                  <li key={init.id}>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        className="px-1 text-xs text-slate-400"
                                        onClick={() => toggleOpen(iKey)}
                                        aria-label={
                                          iOpen ? t("atlasHub.graphCollapse") : t("atlasHub.graphExpand")
                                        }
                                      >
                                        {iOpen ? "▾" : "▸"}
                                      </button>
                                      <RowButton
                                        active={selection?.kind === "initiative" && selection.id === init.id}
                                        depth={2}
                                        label={init.title}
                                        meta={init.status}
                                        onClick={() => select({ kind: "initiative", id: init.id })}
                                      />
                                    </div>
                                    {iOpen ? (
                                      <ul>
                                        {init.features.map((feat) => {
                                          const fKey = nodeKey("feature", feat.id);
                                          const fOpen = isOpen(fKey, forceExpand);
                                          return (
                                            <li key={feat.id}>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  className="px-1 text-xs text-slate-400"
                                                  onClick={() => toggleOpen(fKey)}
                                                  aria-label={
                                                    fOpen ? t("atlasHub.graphCollapse") : t("atlasHub.graphExpand")
                                                  }
                                                >
                                                  {fOpen ? "▾" : "▸"}
                                                </button>
                                                <RowButton
                                                  active={selection?.kind === "feature" && selection.id === feat.id}
                                                  depth={3}
                                                  label={feat.title}
                                                  meta={feat.status}
                                                  onClick={() => select({ kind: "feature", id: feat.id })}
                                                />
                                              </div>
                                              {fOpen ? (
                                                <ul>
                                                  {feat.requirements.map((req) => (
                                                    <li key={req.id}>
                                                      <RowButton
                                                        active={
                                                          selection?.kind === "requirement" &&
                                                          selection.id === req.id
                                                        }
                                                        depth={4}
                                                        label={req.title}
                                                        meta={req.status}
                                                        onClick={() =>
                                                          select({ kind: "requirement", id: req.id })
                                                        }
                                                      />
                                                    </li>
                                                  ))}
                                                </ul>
                                              ) : null}
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        {topics.length > 0 ? (
          <>
            <h2 className="mt-4 text-sm font-semibold text-slate-800">{t("atlasHub.graphTopics")}</h2>
            <ul className="mt-2 space-y-1">
              {topics.map((topic) => (
                <li key={topic.id} className="rounded border border-slate-100">
                  <RowButton
                    active={selection?.kind === "topic" && selection.id === topic.id}
                    depth={0}
                    label={topic.title}
                    meta={topic.slug}
                    onClick={() => select({ kind: "topic", id: topic.id })}
                  />
                  {topic.linkedInitiatives.length > 0 ? (
                    <ul className="ml-6 border-l border-slate-100 pb-1 pl-2">
                      {topic.linkedInitiatives.map((link) => (
                        <li key={link.initiativeId}>
                          <button
                            type="button"
                            className="text-xs text-blue-700 hover:underline"
                            onClick={() => select({ kind: "initiative", id: link.initiativeId })}
                          >
                            {link.initiativeTitle}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-2 pb-1 text-xs text-slate-500">{t("atlasHub.graphTopicNoLinks")}</p>
                  )}
                  {onSelectTopicInOverview ? (
                    <button
                      type="button"
                      className="mb-1 ml-2 text-xs text-slate-500 hover:text-slate-700 hover:underline"
                      onClick={() => onSelectTopicInOverview(topic.id)}
                    >
                      {t("atlasHub.graphOpenTopicOverview")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>

      <Card className="max-h-[70vh] overflow-auto p-3">
        {!selection ? (
          <p className="text-sm text-slate-600">{t("atlasHub.graphSelectNode")}</p>
        ) : (
          <div className="space-y-3">
            <div>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium uppercase text-slate-600">
                {t(`atlasHub.graphNodeType.${selection.kind}`)}
              </span>
              <h2 className="mt-2 text-sm font-semibold text-slate-900">{selectionLabel ?? selection.id}</h2>
              {selectionStatus ? (
                <p className="mt-1 text-xs text-slate-500">
                  {t("common.status")}: {selectionStatus}
                </p>
              ) : null}
            </div>

            {shardLoading ? (
              <p className="text-sm text-slate-500">{t("atlasHub.loading")}</p>
            ) : shard ? (
              <>
                {(shard.graph?.edges?.length ?? 0) > 0 ? (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t("atlasHub.graphEdges")}
                    </h3>
                    <ul className="mt-1 space-y-1 text-xs text-slate-700">
                      {shard.graph!.edges!.map((edge, i) => {
                        const targetTitle =
                          edge.targetType === "INITIATIVE"
                            ? initiativeTitleById.get(edge.targetId) ?? edge.targetId
                            : edge.targetId;
                        return (
                          <li key={`${edge.kind}-${edge.targetId}-${i}`}>
                            <span className="font-mono text-slate-500">{edge.kind}</span>
                            {" → "}
                            {edge.targetType === "INITIATIVE" ? (
                              <button
                                type="button"
                                className="text-blue-700 hover:underline"
                                onClick={() => select({ kind: "initiative", id: edge.targetId })}
                              >
                                {targetTitle}
                              </button>
                            ) : (
                              <span>{targetTitle}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("atlasHub.shardDetail")}
                  </h3>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">
                    {excerpt(shard.facts)}
                  </pre>
                </div>
                <p className="font-mono text-xs text-slate-500">{shard.provenance.materializedAt}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">{t("atlasHub.graphShardMissing")}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

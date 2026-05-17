import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Initiative } from "../types/models";
import { ArchitectureTopicsPage } from "./ArchitectureTopicsPage";
import { AtlasReviewPanel } from "../components/atlas/AtlasReviewPanel";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type Props = {
  isAdmin: boolean;
  initiatives: Initiative[];
};

type AtlasTab = "overview" | "topics" | "graph" | "review" | "connections";

type WorkspaceAtlasPayload = {
  workspaceSlug: string;
  materializedAt: string;
  sourceMaxUpdatedAt: string;
  objectCounts: {
    domain: number;
    product: number;
    initiative: number;
    feature: number;
    requirement: number;
    architectureTopic?: number;
  };
  architectureTopicIndex?: Array<{ id: string; slug: string; title: string; sortOrder: number }>;
  initiativeIndex: Array<{ id: string; title: string; status: string }>;
  featureIndex: Array<{ id: string; title: string; initiativeId: string; status: string }>;
  requirementIndex: Array<{ id: string; title: string; featureId: string; status: string }>;
  auxiliaryIndex?: {
    repositoryConnections?: Array<{ id: string; provider: string; label: string }>;
  };
};

type ObjectShardPayload = {
  facts: Record<string, unknown>;
  provenance: { materializedAt: string; sourceUpdatedAt: string };
};

type TopicLayers = {
  asIs?: {
    capabilities?: Array<{ title: string; slug: string; matchReason: string }>;
    docExcerpts?: Array<{ ref: string; excerpt?: string; error?: string }>;
  };
  toBe?: {
    initiatives?: Array<{ title: string; status: string }>;
    gaps?: Array<{ kind: string; message: string }>;
  };
};

type FreshnessPayload = {
  materializedAt: string;
  sourceMaxUpdatedAt: string;
  workspaceSlug: string;
  isStale: boolean;
  ageMinutes: number;
};

type GitHealthConnection = Awaited<ReturnType<typeof api.getGitObserveHealth>>["connections"][number];
type GitActivityRow = Awaited<ReturnType<typeof api.getGitObserveActivity>>["activities"][number];

const TAB_IDS: AtlasTab[] = ["overview", "topics", "graph", "review", "connections"];

function isAtlasTab(v: string | null): v is AtlasTab {
  return v != null && TAB_IDS.includes(v as AtlasTab);
}

function excerpt(value: unknown, max = 1200): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export function AtlasHubPage({ isAdmin, initiatives }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: AtlasTab = isAtlasTab(tabParam) ? tabParam : "overview";

  const [atlas, setAtlas] = useState<WorkspaceAtlasPayload | null>(null);
  const [compiled, setCompiled] = useState(false);
  const [loadingAtlas, setLoadingAtlas] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicShard, setTopicShard] = useState<ObjectShardPayload | null>(null);
  const [graphInitiativeId, setGraphInitiativeId] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<FreshnessPayload | null>(null);
  const [gitHealth, setGitHealth] = useState<GitHealthConnection[]>([]);
  const [gitActivity, setGitActivity] = useState<GitActivityRow[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);

  const setTab = (next: AtlasTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const refreshAtlas = useCallback(async () => {
    setLoadingAtlas(true);
    try {
      const res = await api.getWorkspaceAtlas();
      setCompiled(res.compiled);
      setAtlas(res.atlas as WorkspaceAtlasPayload | null);
      setFreshness(res.freshness);
    } finally {
      setLoadingAtlas(false);
    }
  }, []);

  useEffect(() => {
    void refreshAtlas();
  }, [refreshAtlas]);

  useEffect(() => {
    if (!selectedTopicId) {
      setTopicShard(null);
      return;
    }
    let cancelled = false;
    void api
      .getWorkspaceAtlasObject("ARCHITECTURE_TOPIC", selectedTopicId)
      .then((res) => {
        if (!cancelled) setTopicShard(res.shard as ObjectShardPayload);
      })
      .catch(() => {
        if (!cancelled) setTopicShard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId]);

  const refreshConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const [healthRes, activityRes] = await Promise.all([
        api.getGitObserveHealth(),
        api.getGitObserveActivity({ limit: 20 })
      ]);
      setGitHealth(healthRes.connections);
      setGitActivity(activityRes.activities);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "connections") void refreshConnections();
  }, [tab, refreshConnections]);

  const featuresByInitiative = useMemo(() => {
    if (!atlas) return new Map<string, WorkspaceAtlasPayload["featureIndex"]>();
    const map = new Map<string, WorkspaceAtlasPayload["featureIndex"]>();
    for (const f of atlas.featureIndex) {
      const list = map.get(f.initiativeId) ?? [];
      list.push(f);
      map.set(f.initiativeId, list);
    }
    return map;
  }, [atlas]);

  const requirementsByFeature = useMemo(() => {
    if (!atlas) return new Map<string, WorkspaceAtlasPayload["requirementIndex"]>();
    const map = new Map<string, WorkspaceAtlasPayload["requirementIndex"]>();
    for (const r of atlas.requirementIndex) {
      const list = map.get(r.featureId) ?? [];
      list.push(r);
      map.set(r.featureId, list);
    }
    return map;
  }, [atlas]);

  const topicLayers = topicShard?.facts?.layers as TopicLayers | undefined;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t("atlasHub.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("atlasHub.intro")}</p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800"
                : "rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            }
          >
            {t(`atlasHub.tabs.${id}`)}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="space-y-4">
          {loadingAtlas ? (
            <p className="text-sm text-slate-500">{t("atlasHub.loading")}</p>
          ) : !compiled || !atlas ? (
            <Card className="p-4">
              <p className="text-sm text-slate-700">{t("atlasHub.notCompiled")}</p>
              <p className="mt-2 text-xs text-slate-500">{t("atlasHub.notCompiledHint")}</p>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("atlasHub.freshness")}
                  </h2>
                  <p className="mt-2 font-mono text-xs text-slate-700">
                    {freshness?.materializedAt ?? atlas.materializedAt}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {freshness?.sourceMaxUpdatedAt ?? atlas.sourceMaxUpdatedAt}
                  </p>
                  {freshness?.isStale ? (
                    <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      {t("atlasHub.staleWarning")}
                    </p>
                  ) : null}
                  {freshness ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {t("atlasHub.ageMinutes", { n: freshness.ageMinutes })}
                    </p>
                  ) : null}
                </Card>
                <Card className="p-3 sm:col-span-2 lg:col-span-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("atlasHub.counts")}
                  </h2>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700 sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <dt className="text-slate-500">{t("atlasHub.countDomains")}</dt>
                      <dd className="font-medium">{atlas.objectCounts.domain}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("atlasHub.countProducts")}</dt>
                      <dd className="font-medium">{atlas.objectCounts.product}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("atlasHub.countInitiatives")}</dt>
                      <dd className="font-medium">{atlas.objectCounts.initiative}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("atlasHub.countFeatures")}</dt>
                      <dd className="font-medium">{atlas.objectCounts.feature}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("atlasHub.countRequirements")}</dt>
                      <dd className="font-medium">{atlas.objectCounts.requirement}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t("atlasHub.countTopics")}</dt>
                      <dd className="font-medium">{atlas.objectCounts.architectureTopic ?? 0}</dd>
                    </div>
                  </dl>
                </Card>
              </div>

              {(atlas.architectureTopicIndex?.length ?? 0) > 0 ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(200px,280px)_1fr]">
                  <Card className="p-3">
                    <h2 className="text-sm font-semibold text-slate-800">{t("atlasHub.compiledTopics")}</h2>
                    <ul className="mt-2 space-y-1">
                      {atlas.architectureTopicIndex!.map((topic) => (
                        <li key={topic.id}>
                          <button
                            type="button"
                            className={
                              selectedTopicId === topic.id
                                ? "w-full rounded bg-slate-100 px-2 py-1 text-left text-sm font-medium text-slate-900"
                                : "w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-50"
                            }
                            onClick={() => setSelectedTopicId(topic.id)}
                          >
                            <span className="font-mono text-xs text-slate-500">{topic.slug}</span>
                            <span className="block truncate">{topic.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                  <Card className="p-3">
                    {selectedTopicId && topicShard ? (
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-slate-800">{t("atlasHub.shardDetail")}</h2>
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500">{t("atlasHub.asIsLayer")}</h3>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">
                            {excerpt(topicLayers?.asIs ?? topicShard.facts.asIsSummary, 800)}
                          </pre>
                          {(topicLayers?.asIs?.capabilities?.length ?? 0) > 0 ? (
                            <ul className="mt-2 space-y-1 text-xs text-slate-700">
                              {topicLayers!.asIs!.capabilities!.map((c) => (
                                <li key={c.slug}>
                                  <span className="font-medium">{c.title}</span>
                                  <span className="text-slate-400"> ({c.matchReason})</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div>
                          <h3 className="text-xs font-semibold text-slate-500">{t("atlasHub.toBeLayer")}</h3>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">
                            {excerpt(topicLayers?.toBe ?? topicShard.facts.toBeSummary, 800)}
                          </pre>
                          {(topicLayers?.toBe?.gaps?.length ?? 0) > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {topicLayers!.toBe!.gaps!.map((g, i) => (
                                <li
                                  key={`${g.kind}-${i}`}
                                  className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900"
                                >
                                  {g.message}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <p className="font-mono text-xs text-slate-500">
                          {topicShard.provenance.materializedAt}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">{t("atlasHub.selectCompiledTopic")}</p>
                    )}
                  </Card>
                </div>
              ) : null}
            </>
          )}
          <Button variant="ghost" className="text-xs" onClick={() => void refreshAtlas()}>
            {t("atlasHub.refresh")}
          </Button>
        </div>
      ) : null}

      {tab === "topics" ? (
        <ArchitectureTopicsPage embedded isAdmin={isAdmin} initiatives={initiatives} />
      ) : null}

      {tab === "graph" ? (
        loadingAtlas ? (
          <p className="text-sm text-slate-500">{t("atlasHub.loading")}</p>
        ) : !compiled || !atlas ? (
          <p className="text-sm text-slate-600">{t("atlasHub.notCompiled")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,360px)]">
            <Card className="max-h-[70vh] overflow-auto p-3">
              <h2 className="text-sm font-semibold text-slate-800">{t("atlasHub.graphBacklog")}</h2>
              <ul className="mt-2 space-y-2">
                {atlas.initiativeIndex.map((init) => {
                  const features = featuresByInitiative.get(init.id) ?? [];
                  const open = graphInitiativeId === init.id;
                  return (
                    <li key={init.id} className="rounded border border-slate-100">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                        onClick={() => setGraphInitiativeId(open ? null : init.id)}
                      >
                        <span className="font-medium text-slate-900">{init.title}</span>
                        <span className="text-xs text-slate-500">{init.status}</span>
                      </button>
                      {open ? (
                        <ul className="border-t border-slate-100 px-3 pb-2">
                          {features.map((f) => (
                            <li key={f.id} className="mt-1 text-xs text-slate-700">
                              <span className="font-medium">{f.title}</span>
                              <span className="text-slate-500"> ({f.status})</span>
                              <ul className="ml-3 mt-0.5 text-slate-600">
                                {(requirementsByFeature.get(f.id) ?? []).map((r) => (
                                  <li key={r.id}>
                                    {r.title} <span className="text-slate-400">({r.status})</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {(atlas.architectureTopicIndex?.length ?? 0) > 0 ? (
                <>
                  <h2 className="mt-4 text-sm font-semibold text-slate-800">{t("atlasHub.graphTopics")}</h2>
                  <ul className="mt-2 space-y-1">
                    {atlas.architectureTopicIndex!.map((topic) => (
                      <li key={topic.id}>
                        <button
                          type="button"
                          className="text-sm text-blue-700 hover:underline"
                          onClick={() => {
                            setSelectedTopicId(topic.id);
                            setTab("overview");
                          }}
                        >
                          {topic.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
            <Card className="p-3">
              <p className="text-sm text-slate-600">{t("atlasHub.graphHint")}</p>
            </Card>
          </div>
        )
      ) : null}

      {tab === "review" ? <AtlasReviewPanel isAdmin={isAdmin} /> : null}

      {tab === "connections" ? (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p className="text-sm text-slate-600">{t("atlasHub.connectionsIntro")}</p>
            {loadingConnections ? (
              <p className="text-sm text-slate-500">{t("atlasHub.loading")}</p>
            ) : gitHealth.length === 0 ? (
              <p className="text-sm text-slate-500">{t("atlasHub.connectionsNone")}</p>
            ) : (
              <ul className="space-y-3">
                {gitHealth.map((c) => (
                  <li key={c.id} className="rounded border border-slate-200 p-3 text-sm">
                    <div className="font-medium text-slate-900">
                      {c.displayName ?? `${c.owner}/${c.repo}`}
                      <span className="ml-2 text-xs font-normal text-slate-500">{c.provider}</span>
                    </div>
                    <dl className="mt-2 grid gap-1 text-xs text-slate-600">
                      <div>
                        <dt className="inline text-slate-500">{t("atlasHub.webhookUrl")}: </dt>
                        <dd className="inline font-mono">{c.webhookUrl}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-500">{t("atlasHub.webhookSecret")}: </dt>
                        <dd className="inline">
                          {c.webhookSecretConfigured ? t("atlasHub.configured") : t("atlasHub.missing")}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-500">{t("atlasHub.lastWebhook")}: </dt>
                        <dd className="inline font-mono">
                          {c.lastWebhookReceivedAt ?? t("atlasHub.never")}
                          {c.lastWebhookEventType ? ` (${c.lastWebhookEventType})` : ""}
                        </dd>
                      </div>
                      {c.lastWebhookError ? (
                        <div className="text-amber-800">{c.lastWebhookError}</div>
                      ) : null}
                    </dl>
                    {isAdmin ? (
                      <Button
                        variant="ghost"
                        className="mt-2 h-7 text-xs"
                        onClick={() => void api.testGitObserveConnection(c.id).then(() => refreshConnections())}
                      >
                        {t("atlasHub.testWebhook")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Link to="/sdlc" className="inline-block text-sm text-blue-700 hover:underline">
              {t("atlasHub.openSdlc")}
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-800">{t("atlasHub.recentGitActivity")}</h2>
            {gitActivity.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t("atlasHub.gitActivityNone")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {gitActivity.map((a) => (
                  <li key={a.id} className="text-sm text-slate-800">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium uppercase">
                      {a.kind}
                    </span>{" "}
                    {a.externalUrl ? (
                      <a
                        href={a.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        {a.title ?? a.branch ?? a.commitSha}
                      </a>
                    ) : (
                      <span>{a.title ?? a.branch ?? a.commitSha}</span>
                    )}
                    <span className="block text-xs text-slate-500">
                      {a.repository.owner}/{a.repository.repo}
                      {a.authorLogin ? ` · ${a.authorLogin}` : ""} · {a.occurredAt}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

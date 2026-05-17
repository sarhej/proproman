import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { ArchitectureTopic, Capability, Initiative } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
  initiatives: Initiative[];
  /** When rendered inside Atlas hub Topics tab, hide duplicate page header. */
  embedded?: boolean;
};

function parseLines(s: string): string[] {
  return s
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function linesFromJsonArray(json: unknown): string {
  if (json == null) return "";
  if (Array.isArray(json)) return json.map(String).join("\n");
  return String(json);
}

const LOCKABLE_FIELDS = ["asIsSummary", "toBeSummary", "title", "synonyms", "docPaths"] as const;

const emptyDraft = {
  slug: "",
  title: "",
  asIsSummary: "",
  toBeSummary: "",
  synonymsText: "",
  docPathsText: "",
  autoMatchCapabilities: true,
  lockedFields: [] as string[],
  initiativeIds: [] as string[],
  capabilityIds: [] as string[]
};

export function ArchitectureTopicsPage({ isAdmin, initiatives, embedded = false }: Props) {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<ArchitectureTopic[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => topics.find((x) => x.id === selectedId) ?? null,
    [topics, selectedId]
  );

  const loadDraftFromTopic = useCallback((topic: ArchitectureTopic) => {
    setDraft({
      slug: topic.slug,
      title: topic.title,
      asIsSummary: topic.asIsSummary ?? "",
      toBeSummary: topic.toBeSummary ?? "",
      synonymsText: linesFromJsonArray(topic.synonyms),
      docPathsText: linesFromJsonArray(topic.docPaths),
      autoMatchCapabilities: topic.autoMatchCapabilities,
      lockedFields: Array.isArray(topic.lockedFields) ? topic.lockedFields.map(String) : [],
      initiativeIds: topic.initiativeLinks?.map((l) => l.initiativeId) ?? [],
      capabilityIds: topic.capabilityLinks?.map((l) => l.capabilityId) ?? []
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [topicsRes, capsRes] = await Promise.all([
        api.getArchitectureTopics(),
        api.getOntologyCapabilities("ACTIVE")
      ]);
      setTopics(topicsRes.architectureTopics);
      setCapabilities(capsRes.capabilities);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected) loadDraftFromTopic(selected);
    else setDraft(emptyDraft);
  }, [selected, loadDraftFromTopic]);

  async function saveTopic() {
    if (!isAdmin || !draft.slug.trim() || !draft.title.trim()) return;
    setSaving(true);
    try {
      const body = {
        slug: draft.slug.trim(),
        title: draft.title.trim(),
        asIsSummary: draft.asIsSummary.trim() || null,
        toBeSummary: draft.toBeSummary.trim() || null,
        synonyms: parseLines(draft.synonymsText),
        docPaths: parseLines(draft.docPathsText),
        autoMatchCapabilities: draft.autoMatchCapabilities,
        lockedFields: draft.lockedFields,
        initiativeIds: draft.initiativeIds,
        capabilityIds: draft.capabilityIds
      };
      if (selectedId) {
        await api.updateArchitectureTopic(selectedId, body);
      } else {
        const created = await api.createArchitectureTopic(body);
        setSelectedId(created.architectureTopic.id);
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  return (
    <div className={embedded ? "space-y-4" : "space-y-4 p-4"}>
      {embedded ? null : (
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t("architectureTopicsPage.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("architectureTopicsPage.intro")}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(200px,280px)_1fr]">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">{t("architectureTopicsPage.topics")}</h2>
            {isAdmin ? (
              <Button
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setSelectedId(null);
                  setDraft(emptyDraft);
                }}
              >
                {t("architectureTopicsPage.newTopic")}
              </Button>
            ) : null}
          </div>
          {loading ? <p className="text-sm text-slate-500">{t("common.loading")}</p> : null}
          <ul className="max-h-[70vh] space-y-1 overflow-auto text-sm">
            {topics.map((topic) => (
              <li key={topic.id}>
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1.5 text-left hover:bg-slate-100 ${
                    selectedId === topic.id ? "bg-sky-50 font-medium text-sky-900" : "text-slate-800"
                  }`}
                  onClick={() => setSelectedId(topic.id)}
                >
                  <span className="font-mono text-xs text-slate-500">{topic.slug}</span>
                  <div>{topic.title}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          {!isAdmin && !selected ? (
            <p className="text-sm text-slate-600">{t("architectureTopicsPage.selectToView")}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("architectureTopicsPage.slug")}
                  </label>
                  <Input
                    value={draft.slug}
                    disabled={!isAdmin || Boolean(selectedId)}
                    onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                    placeholder="multitenancy"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("architectureTopicsPage.titleLabel")}
                  </label>
                  <Input
                    value={draft.title}
                    disabled={!isAdmin}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("architectureTopicsPage.asIsSummary")}
                </label>
                <Textarea
                  rows={5}
                  disabled={!isAdmin}
                  value={draft.asIsSummary}
                  onChange={(e) => setDraft((d) => ({ ...d, asIsSummary: e.target.value }))}
                  placeholder={t("architectureTopicsPage.asIsPlaceholder")}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("architectureTopicsPage.toBeSummary")}
                </label>
                <Textarea
                  rows={3}
                  disabled={!isAdmin}
                  value={draft.toBeSummary}
                  onChange={(e) => setDraft((d) => ({ ...d, toBeSummary: e.target.value }))}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("architectureTopicsPage.synonyms")}
                  </label>
                  <Textarea
                    rows={3}
                    disabled={!isAdmin}
                    value={draft.synonymsText}
                    onChange={(e) => setDraft((d) => ({ ...d, synonymsText: e.target.value }))}
                    placeholder="tenant, workspace"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("architectureTopicsPage.docPaths")}
                  </label>
                  <Textarea
                    rows={3}
                    disabled={!isAdmin}
                    value={draft.docPathsText}
                    onChange={(e) => setDraft((d) => ({ ...d, docPathsText: e.target.value }))}
                    placeholder="docs/HUB.md#12-multi-tenancy-as-implemented"
                  />
                  <p className="mt-1 text-xs text-slate-500">{t("architectureTopicsPage.docPathsHint")}</p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={draft.autoMatchCapabilities}
                  onChange={(e) => setDraft((d) => ({ ...d, autoMatchCapabilities: e.target.checked }))}
                />
                {t("architectureTopicsPage.autoMatchCapabilities")}
              </label>

              {isAdmin ? (
                <div>
                  <p className="text-sm font-medium text-slate-800">{t("architectureTopicsPage.lockedFields")}</p>
                  <p className="mt-1 text-xs text-slate-500">{t("architectureTopicsPage.lockedFieldsHint")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {LOCKABLE_FIELDS.map((field) => (
                      <label key={field} className="flex items-center gap-1 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.lockedFields.includes(field)}
                          onChange={() =>
                            setDraft((d) => ({
                              ...d,
                              lockedFields: d.lockedFields.includes(field)
                                ? d.lockedFields.filter((x) => x !== field)
                                : [...d.lockedFields, field]
                            }))
                          }
                        />
                        {field}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  {t("architectureTopicsPage.linkedInitiatives")}
                </h3>
                <ul className="max-h-36 space-y-1 overflow-auto rounded border border-slate-200 p-2 text-sm">
                  {initiatives.map((i) => (
                    <li key={i.id}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          disabled={!isAdmin}
                          checked={draft.initiativeIds.includes(i.id)}
                          onChange={() =>
                            setDraft((d) => ({
                              ...d,
                              initiativeIds: toggleId(d.initiativeIds, i.id)
                            }))
                          }
                        />
                        <span>
                          {i.title}{" "}
                          <span className="text-xs text-slate-500">
                            ({i.status}, {i.horizon})
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  {t("architectureTopicsPage.linkedCapabilities")}
                </h3>
                <ul className="max-h-36 space-y-1 overflow-auto rounded border border-slate-200 p-2 text-sm">
                  {capabilities.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          disabled={!isAdmin}
                          checked={draft.capabilityIds.includes(c.id)}
                          onChange={() =>
                            setDraft((d) => ({
                              ...d,
                              capabilityIds: toggleId(d.capabilityIds, c.id)
                            }))
                          }
                        />
                        <span>
                          <span className="font-mono text-xs text-slate-500">{c.slug}</span> {c.title}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {isAdmin ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  <Button disabled={saving} onClick={() => void saveTopic()}>
                    {saving ? t("common.loading") : t("common.save")}
                  </Button>
                  {selectedId ? (
                    <Button
                      variant="ghost"
                      className="text-red-600"
                      onClick={async () => {
                        if (!window.confirm(t("architectureTopicsPage.confirmDelete"))) return;
                        await api.deleteArchitectureTopic(selectedId);
                        setSelectedId(null);
                        await refresh();
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <p className="text-xs text-slate-500">{t("architectureTopicsPage.atlasHint")}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
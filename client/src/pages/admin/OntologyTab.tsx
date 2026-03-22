import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import type { BindingType, Capability, CapabilityBinding, CapabilityStatus } from "../../types/models";

const BINDING_TYPES: BindingType[] = [
  "ROUTE",
  "PAGE",
  "API_ROUTE",
  "MCP_TOOL",
  "PRISMA_MODEL",
  "FILE_GLOB",
  "INFRA"
];

const STATUSES: CapabilityStatus[] = ["ACTIVE", "DRAFT", "DEPRECATED"];

export function OntologyTab() {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<(Capability & { bindings: CapabilityBinding[] })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [draftSlug, setDraftSlug] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUserJob, setDraftUserJob] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftDoNot, setDraftDoNot] = useState("");
  const [draftSynonyms, setDraftSynonyms] = useState("");
  const [draftStatus, setDraftStatus] = useState<CapabilityStatus>("DRAFT");
  const [draftSort, setDraftSort] = useState(0);

  const [newBindType, setNewBindType] = useState<BindingType>("ROUTE");
  const [newBindKey, setNewBindKey] = useState("");
  const [newBindNotes, setNewBindNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { capabilities: list } = await api.getOntologyCapabilities();
      setCapabilities(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = capabilities.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setDraftSlug("");
      setDraftTitle("");
      setDraftUserJob("");
      setDraftDescription("");
      setDraftDoNot("");
      setDraftSynonyms("");
      setDraftStatus("DRAFT");
      setDraftSort(0);
      return;
    }
    setDraftSlug(selected.slug);
    setDraftTitle(selected.title);
    setDraftUserJob(selected.userJob ?? "");
    setDraftDescription(selected.description ?? "");
    setDraftDoNot(selected.doNotConfuseWith ?? "");
    setDraftSynonyms(
      Array.isArray(selected.synonyms) ? selected.synonyms.join(", ") : selected.synonyms ? String(selected.synonyms) : ""
    );
    setDraftStatus(selected.status);
    setDraftSort(selected.sortOrder);
  }, [selected]);

  async function saveCapability() {
    if (!selected) return;
    setBusy("save");
    setError(null);
    try {
      const synonyms = draftSynonyms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { capability } = await api.updateOntologyCapability(selected.id, {
        title: draftTitle,
        userJob: draftUserJob || null,
        description: draftDescription || null,
        doNotConfuseWith: draftDoNot || null,
        synonyms: synonyms.length ? synonyms : null,
        status: draftStatus,
        sortOrder: draftSort
      });
      setCapabilities((prev) => prev.map((c) => (c.id === capability.id ? capability : c)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createCapability() {
    const slug = window.prompt(t("admin.ontology.slugPrompt"));
    if (!slug?.trim()) return;
    const title = window.prompt(t("admin.ontology.titlePrompt")) ?? slug.trim();
    setBusy("create");
    setError(null);
    try {
      const { capability } = await api.createOntologyCapability({
        slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
        title: title.trim(),
        status: "DRAFT",
        sortOrder: capabilities.length * 10
      });
      setCapabilities((prev) => [...prev, capability].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug)));
      setSelectedId(capability.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteCapability() {
    if (!selected || !window.confirm(t("admin.ontology.deleteConfirm", { title: selected.title }))) return;
    setBusy("delete");
    try {
      await api.deleteOntologyCapability(selected.id);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addBinding() {
    if (!selected || !newBindKey.trim()) return;
    setBusy("bind");
    try {
      const { binding } = await api.createOntologyBinding({
        capabilityId: selected.id,
        bindingType: newBindType,
        bindingKey: newBindKey.trim(),
        notes: newBindNotes.trim() || null,
        generated: false
      });
      setCapabilities((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, bindings: [...c.bindings, binding] } : c))
      );
      setNewBindKey("");
      setNewBindNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeBinding(id: string) {
    if (!window.confirm(t("admin.ontology.removeBindingConfirm"))) return;
    setBusy("unbind");
    try {
      await api.deleteOntologyBinding(id);
      setCapabilities((prev) =>
        prev.map((c) =>
          c.id === selected?.id ? { ...c, bindings: c.bindings.filter((b) => b.id !== id) } : c
        )
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runRefresh() {
    setBusy("refresh");
    setError(null);
    try {
      await api.refreshOntologyBindings();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runCompile() {
    setBusy("compile");
    setError(null);
    try {
      await api.compileOntologyBrief();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runExport() {
    setBusy("export");
    setError(null);
    try {
      const r = await api.exportOntologyBriefFile({ mode: "compact" });
      alert(t("admin.ontology.exportedTo", { path: r.path }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    setBusy("preview");
    try {
      const text = await api.getOntologyBriefText("md", "compact");
      setPreview(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">{t("admin.loadingUsers")}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t("admin.ontology.desc")}</p>
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!!busy} onClick={() => void runRefresh()}>
          {t("admin.ontology.refreshDefaults")}
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => void runCompile()}>
          {t("admin.ontology.compileStore")}
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => void runExport()}>
          {t("admin.ontology.exportFile")}
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => void runPreview()}>
          {t("admin.ontology.previewBrief")}
        </Button>
        <Button disabled={!!busy} onClick={() => void createCapability()}>
          {t("admin.ontology.newCapability")}
        </Button>
      </div>

      {preview ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex justify-between">
            <span className="text-sm font-medium">{t("admin.ontology.previewTitle")}</span>
            <button type="button" className="text-xs text-indigo-600" onClick={() => setPreview(null)}>
              {t("common.close")}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-800">{preview}</pre>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded border border-gray-200 bg-white p-2">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-500">{t("admin.ontology.capabilities")}</div>
          <ul className="max-h-[480px] space-y-1 overflow-y-auto text-sm">
            {capabilities.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1 text-left ${selectedId === c.id ? "bg-indigo-100 text-indigo-900" : "hover:bg-gray-50"}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="font-medium">{c.title}</span>
                  <span className="block text-xs text-gray-500">{c.slug}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
          {!selected ? (
            <p className="text-sm text-gray-500">{t("admin.ontology.selectOne")}</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-gray-600">{t("admin.ontology.slug")}</span>
                  <input className="mt-1 w-full rounded border px-2 py-1 text-sm bg-gray-50" readOnly value={draftSlug} />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600">{t("admin.ontology.sortOrder")}</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    value={draftSort}
                    onChange={(e) => setDraftSort(Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-600">{t("admin.ontology.title")}</span>
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">{t("admin.ontology.userJob")}</span>
                <textarea className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={2} value={draftUserJob} onChange={(e) => setDraftUserJob(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">{t("admin.ontology.description")}</span>
                <textarea className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={3} value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">{t("admin.ontology.synonyms")}</span>
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={draftSynonyms} onChange={(e) => setDraftSynonyms(e.target.value)} placeholder="foo, bar" />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">{t("admin.ontology.doNotConfuse")}</span>
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={draftDoNot} onChange={(e) => setDraftDoNot(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">{t("admin.ontology.status")}</span>
                <select className="mt-1 w-full rounded border px-2 py-1 text-sm" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as CapabilityStatus)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button disabled={busy === "save"} onClick={() => void saveCapability()}>
                  {t("common.save")}
                </Button>
                <Button variant="secondary" disabled={busy === "delete"} onClick={() => void deleteCapability()}>
                  {t("admin.ontology.deleteCapability")}
                </Button>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-2 text-sm font-semibold">{t("admin.ontology.bindings")}</h3>
                <div className="mb-3 flex flex-wrap gap-2">
                  <select className="rounded border px-2 py-1 text-sm" value={newBindType} onChange={(e) => setNewBindType(e.target.value as BindingType)}>
                    {BINDING_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                  <input className="min-w-[160px] flex-1 rounded border px-2 py-1 text-sm" value={newBindKey} onChange={(e) => setNewBindKey(e.target.value)} placeholder="/route or drd_*" />
                  <input className="min-w-[120px] flex-1 rounded border px-2 py-1 text-sm" value={newBindNotes} onChange={(e) => setNewBindNotes(e.target.value)} placeholder={t("admin.ontology.notes")} />
                  <Button variant="secondary" disabled={busy === "bind"} onClick={() => void addBinding()}>
                    {t("admin.ontology.addBinding")}
                  </Button>
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="py-1">{t("admin.ontology.type")}</th>
                      <th className="py-1">{t("admin.ontology.key")}</th>
                      <th className="py-1">{t("admin.ontology.gen")}</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.bindings.map((b) => (
                      <tr key={b.id} className="border-b border-gray-100">
                        <td className="py-1 font-mono text-xs">{b.bindingType}</td>
                        <td className="py-1 font-mono text-xs">{b.bindingKey}</td>
                        <td className="py-1">{b.generated ? "yes" : "—"}</td>
                        <td className="py-1 text-right">
                          <button type="button" className="text-xs text-red-600" onClick={() => void removeBinding(b.id)}>
                            {t("common.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

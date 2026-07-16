import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, attachmentBackupManifestUrl, attachmentContentUrl } from "../../lib/api";
import type { Attachment, AttachmentBackupJob } from "../../types/models";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";

/**
 * Admin → Artifacts — browse / search / retire / restore / backup manifest.
 */
export function AdminArtifactsPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [includeRetired, setIncludeRetired] = useState(true);
  const [items, setItems] = useState<Attachment[]>([]);
  const [jobs, setJobs] = useState<AttachmentBackupJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [att, backups] = await Promise.all([
        api.listAttachments({
          q: q.trim() || undefined,
          includeRetired,
          status: includeRetired ? "ALL" : "ACTIVE"
        }),
        api.listAttachmentBackups()
      ]);
      setItems(att.attachments);
      setJobs(backups.jobs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attachments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [q, includeRetired, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("attachments.adminTitle")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("attachments.adminSubtitle")}</p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium text-slate-600">{t("attachments.searchPlaceholder")}</label>
          <Input className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
          />
          {t("attachments.includeRetired")}
        </label>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {t("common.refresh")}
        </Button>
        <Button
          type="button"
          onClick={async () => {
            setMessage(null);
            try {
              const res = await api.createAttachmentBackup({ includeRetired: true });
              setMessage(t("attachments.backupCreated"));
              await load();
              window.open(attachmentBackupManifestUrl(res.job.id), "_blank");
            } catch (e) {
              setError(e instanceof Error ? e.message : t("attachments.backupFailed"));
            }
          }}
        >
          {t("attachments.runBackup")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">{t("common.loading")}</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("attachments.colPreview")}</th>
                <th className="px-3 py-2">{t("attachments.colFilename")}</th>
                <th className="px-3 py-2">{t("attachments.colStatus")}</th>
                <th className="px-3 py-2">{t("attachments.colLinks")}</th>
                <th className="px-3 py-2">{t("attachments.colSize")}</th>
                <th className="px-3 py-2">{t("attachments.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">
                    <a href={attachmentContentUrl(a.id, a.status === "RETIRED")} target="_blank" rel="noreferrer">
                      <img
                        src={attachmentContentUrl(a.id, a.status === "RETIRED")}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{a.filename}</div>
                    <div className="text-xs text-slate-500">{a.mimeType}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        a.status === "ACTIVE"
                          ? "bg-green-50 text-green-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{a._count?.links ?? a.links?.length ?? 0}</td>
                  <td className="px-3 py-2">{Math.round(a.byteSize / 1024)} KiB</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {a.status === "ACTIVE" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await api.retireAttachment(a.id);
                            await load();
                          }}
                        >
                          {t("attachments.retire")}
                        </Button>
                      ) : null}
                      {a.status === "RETIRED" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await api.restoreAttachment(a.id);
                              await load();
                            }}
                          >
                            {t("attachments.restore")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              if (!window.confirm(t("attachments.hardDeleteConfirm"))) return;
                              await api.hardDeleteAttachment(a.id);
                              await load();
                            }}
                          >
                            {t("attachments.hardDelete")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {t("attachments.libraryEmpty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t("attachments.backupJobs")}</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500">{t("attachments.noBackupJobs")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-slate-500">{j.id.slice(0, 8)}…</span>
                <span>{j.status}</span>
                {j.status === "SUCCEEDED" ? (
                  <a
                    className="text-sky-600 hover:underline"
                    href={attachmentBackupManifestUrl(j.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("attachments.downloadManifest")}
                  </a>
                ) : null}
                {j.error ? <span className="text-red-600">{j.error}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

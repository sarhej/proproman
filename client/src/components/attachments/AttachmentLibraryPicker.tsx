import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, attachmentContentUrl } from "../../lib/api";
import type { Attachment } from "../../types/models";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (attachmentId: string) => void | Promise<void>;
};

export function AttachmentLibraryPicker({ open, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .listAttachments({ q: q.trim() || undefined, status: "ACTIVE" })
      .then((res) => {
        if (!cancelled) {
          setItems(res.attachments);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("attachments.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, q, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{t("attachments.libraryTitle")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("attachments.libraryHint")}</p>
          <Input
            className="mt-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("attachments.searchPlaceholder")}
          />
        </div>
        <div className="flex-1 overflow-auto p-3">
          {error ? (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700">{error}</p>
          ) : null}
          {loading ? (
            <p className="text-sm text-slate-500">{t("common.loading")}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">{t("attachments.libraryEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded border border-slate-100 px-2 py-2 hover:bg-slate-50"
                >
                  <img
                    src={attachmentContentUrl(a.id)}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.filename}</div>
                    <div className="text-xs text-slate-500">
                      {a._count?.links ?? 0} {t("attachments.linksCount")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === a.id}
                    onClick={async () => {
                      setBusyId(a.id);
                      try {
                        await onSelect(a.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {t("attachments.link")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-3 text-right">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

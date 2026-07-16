import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, attachmentContentUrl } from "../../lib/api";
import {
  imageFileFromDataTransfer,
  validateClientImageFile
} from "../../lib/attachmentCapture";
import type { AttachmentLink } from "../../types/models";
import { Button } from "../ui/Button";
import { ImageAnnotatorDialog } from "./ImageAnnotatorDialog";
import { AttachmentLibraryPicker } from "./AttachmentLibraryPicker";

export type AttachmentTarget = {
  featureId?: string | null;
  requirementId?: string | null;
  initiativeId?: string | null;
  demandId?: string | null;
  intakeSessionId?: string | null;
};

type Props = {
  target: AttachmentTarget;
  readOnly?: boolean;
};

/**
 * Shared attachments panel — paste / drop / upload + link-from-library.
 * Context-bound only (no global overlay).
 */
export function AttachmentPanel({ target, readOnly }: Props) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<AttachmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const pendingPreviewUrl = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile]
  );

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAttachmentLinks({
        featureId: target.featureId ?? undefined,
        requirementId: target.requirementId ?? undefined,
        initiativeId: target.initiativeId ?? undefined,
        demandId: target.demandId ?? undefined,
        intakeSessionId: target.intakeSessionId ?? undefined
      });
      setLinks(res.attachmentLinks);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attachments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [target, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFile = async (file: File, source: "UPLOAD" | "PASTE") => {
    const check = validateClientImageFile(file);
    if (!check.ok) {
      setError(t(`attachments.errors.${check.reason}`));
      return;
    }
    setError(null);
    try {
      await api.uploadAttachment(file, {
        filename: file.name,
        source,
        ...target
      });
      setPendingFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attachments.uploadFailed"));
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (readOnly) return;
    const file = imageFileFromDataTransfer(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    setPendingFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    const file = imageFileFromDataTransfer(e.dataTransfer);
    if (file) setPendingFile(file);
  };

  return (
    <section
      ref={zoneRef}
      className={`rounded-lg border bg-white p-4 ${dragOver ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}
      onPaste={onPaste}
      onDragOver={(e) => {
        e.preventDefault();
        if (!readOnly) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      tabIndex={0}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{t("attachments.panelTitle")}</h2>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
              {t("attachments.linkFromLibrary")}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
              {t("attachments.upload")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPendingFile(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-slate-500">{t("attachments.pasteHint")}</p>
      {error ? (
        <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-slate-500">{t("attachments.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const a = link.attachment;
            if (!a) return null;
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-3 text-sm">
                <a
                  href={attachmentContentUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-14 w-14 overflow-hidden rounded border border-slate-200 bg-slate-50"
                >
                  <img
                    src={attachmentContentUrl(a.id)}
                    alt={a.filename}
                    className="h-full w-full object-cover"
                  />
                </a>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{a.filename}</div>
                  <div className="text-xs text-slate-500">
                    {a.mimeType} · {Math.round(a.byteSize / 1024)} KiB
                    {a.kind === "ANNOTATED" ? ` · ${t("attachments.kindAnnotated")}` : ""}
                  </div>
                </div>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600"
                    onClick={async () => {
                      await api.deleteAttachmentLink(link.id);
                      await load();
                    }}
                  >
                    {t("attachments.unlink")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pendingFile && !annotating && pendingPreviewUrl ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold">{t("attachments.captureTitle")}</h3>
            <img
              src={pendingPreviewUrl}
              alt=""
              className="mb-3 max-h-48 w-full rounded object-contain bg-slate-50"
            />
            <p className="mb-3 truncate text-xs text-slate-600">
              {pendingFile.name} · {Math.round(pendingFile.size / 1024)} KiB
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setAnnotating(true)}>
                {t("attachments.annotate")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void uploadFile(pendingFile, pendingFile.name.startsWith("image") ? "PASTE" : "UPLOAD")
                }
              >
                {t("attachments.attachAsIs")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPendingFile(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {annotating && pendingFile ? (
        <ImageAnnotatorDialog
          open
          imageFile={pendingFile}
          onClose={() => setAnnotating(false)}
          onSave={async (annotated) => {
            setAnnotating(false);
            try {
              const orig = await api.uploadAttachment(pendingFile, {
                filename: pendingFile.name,
                source: "PASTE",
                kind: "ORIGINAL",
                ...target
              });
              await api.uploadAttachment(annotated, {
                filename: annotated.name,
                source: "PASTE",
                kind: "ANNOTATED",
                parentAttachmentId: orig.attachment.id,
                ...target
              });
              setPendingFile(null);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : t("attachments.uploadFailed"));
            }
          }}
        />
      ) : null}

      {pickerOpen ? (
        <AttachmentLibraryPicker
          open
          onClose={() => setPickerOpen(false)}
          onSelect={async (attachmentId) => {
            await api.createAttachmentLink({
              attachmentId,
              ...target
            });
            setPickerOpen(false);
            await load();
          }}
        />
      ) : null}
    </section>
  );
}

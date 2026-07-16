import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Button } from "../ui/Button";
import type { AttachmentTarget } from "../attachments/AttachmentPanel";

export type VoiceCaptureMode = "attachment" | "field";

type Props = {
  open: boolean;
  mode: VoiceCaptureMode;
  target?: AttachmentTarget;
  onClose: () => void;
  /** Called after successful capture; transcript always provided. */
  onComplete: (result: { transcript: string; inserted: boolean }) => void;
};

type Phase = "recording" | "transcribing" | "review" | "saving";

/**
 * Shared voice capture sheet: record → STT → review → attach (optional insert).
 */
export function VoiceCaptureSheet({ open, mode, target, onClose, onComplete }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("recording");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("recording");
    setError(null);
    setTranscript("");
    setElapsed(0);
    chunksRef.current = [];
    blobRef.current = null;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        mediaRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          void (async () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
            blobRef.current = blob;
            const url = URL.createObjectURL(blob);
            setPreviewUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            if (!blob.size) {
              setError(t("attachments.voice.emptyRecording"));
              setPhase("review");
              return;
            }
            setPhase("transcribing");
            try {
              const file = new File([blob], `voice-${Date.now()}.webm`, {
                type: blob.type || "audio/webm"
              });
              const res = await api.voiceTranscribe(file);
              if (!cancelled) {
                setTranscript(res.transcript);
                setPhase("review");
              }
            } catch (e) {
              if (cancelled) return;
              const msg = e instanceof Error ? e.message : t("attachments.voice.captureFailed");
              setError(
                msg.includes("SPEECH_NOT_CONFIGURED")
                  ? t("attachments.voice.notConfigured")
                  : msg
              );
              setPhase("review");
            }
          })();
        };
        recorder.start(250);
        const started = Date.now();
        timerRef.current = window.setInterval(() => {
          setElapsed(Math.floor((Date.now() - started) / 1000));
        }, 250);
      } catch {
        if (!cancelled) setError(t("attachments.voice.permissionDenied"));
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      try {
        if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaRef.current = null;
      streamRef.current = null;
    };
  }, [open, t]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!open) return null;

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    } else {
      setError(t("attachments.voice.emptyRecording"));
    }
  };

  const commit = async (insert: boolean) => {
    const blob = blobRef.current;
    if (!blob || blob.size === 0) {
      setError(t("attachments.voice.emptyRecording"));
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, {
        type: blob.type || "audio/webm"
      });
      const res = await api.voiceCapture(file, {
        filename: file.name,
        transcript: transcript.trim() || undefined,
        featureId: target?.featureId,
        requirementId: target?.requirementId,
        initiativeId: target?.initiativeId,
        demandId: target?.demandId,
        intakeSessionId: target?.intakeSessionId
      });
      const text = transcript.trim() || res.transcript;
      onComplete({ transcript: text, inserted: insert && mode === "field" });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("attachments.voice.captureFailed");
      setError(msg.includes("SPEECH_NOT_CONFIGURED") ? t("attachments.voice.notConfigured") : msg);
      setPhase("review");
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">
          {phase === "recording"
            ? t("attachments.voice.recording")
            : phase === "transcribing" || phase === "saving"
              ? t("attachments.voice.transcribing")
              : t("attachments.voice.reviewTitle")}
        </h3>
        <p className="mb-3 text-xs text-slate-500">{t("attachments.voice.piiNotice")}</p>
        {error ? (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {phase === "recording" ? (
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-600" />
            <span className="font-mono text-sm text-slate-700">
              {mm}:{ss}
            </span>
            <div className="ml-auto flex gap-2">
              <Button type="button" onClick={stopRecording}>
                {t("attachments.voice.stop")}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "transcribing" ? (
          <p className="py-6 text-center text-sm text-slate-500">{t("attachments.voice.transcribing")}</p>
        ) : null}

        {phase === "review" || phase === "saving" ? (
          <>
            {previewUrl ? <audio className="mb-3 w-full" controls src={previewUrl} /> : null}
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {t("attachments.voice.transcriptLabel")}
            </label>
            <textarea
              className="mb-3 w-full rounded border border-slate-200 p-2 text-sm"
              rows={4}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              disabled={phase === "saving"}
            />
            <div className="flex flex-wrap gap-2">
              {mode === "field" ? (
                <Button type="button" onClick={() => void commit(true)} disabled={phase === "saving"}>
                  {t("attachments.voice.attachAndInsert")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={mode === "field" ? "secondary" : "primary"}
                onClick={() => void commit(false)}
                disabled={phase === "saving"}
              >
                {t("attachments.voice.attachOnly")}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={phase === "saving"}>
                {t("attachments.voice.discard")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

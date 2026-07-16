import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Button } from "../ui/Button";
import type { AttachmentTarget } from "../attachments/AttachmentPanel";
import { VoiceCaptureSheet, type VoiceCaptureMode } from "./VoiceCaptureSheet";

type Props = {
  mode: VoiceCaptureMode;
  target?: AttachmentTarget;
  disabled?: boolean;
  /** When mode=field and user chooses Attach & insert */
  onInsertTranscript?: (transcript: string) => void;
  onAttached?: () => void;
  className?: string;
};

/**
 * Shared mic entry point — hides itself when speech STT is not configured.
 */
export function VoiceMicButton({
  mode,
  target,
  disabled,
  onInsertTranscript,
  onAttached,
  className
}: Props) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(
      typeof api.getVoiceStatus === "function"
        ? api.getVoiceStatus()
        : Promise.resolve({ enabled: false })
    )
      .then((s) => {
        if (!cancelled) setEnabled(s.enabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === false) return null;
  if (enabled === null) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t("attachments.voice.mic")}
      </Button>
      {open ? (
        <VoiceCaptureSheet
          open
          mode={mode}
          target={target}
          onClose={() => setOpen(false)}
          onComplete={({ transcript, inserted }) => {
            if (inserted) onInsertTranscript?.(transcript);
            onAttached?.();
          }}
        />
      ) : null}
    </>
  );
}

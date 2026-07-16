import { env } from "../env.js";

export type TranscribeResult = {
  text: string;
  language?: string | null;
};

export type WhisperDeps = {
  apiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
};

export function resolveSpeechApiKey(): string | null {
  return env.SPEECH_OPENAI_API_KEY ?? env.WORKSPACE_ATLAS_OPENAI_API_KEY ?? null;
}

export function isSpeechSttConfigured(): boolean {
  return !!env.SPEECH_STT_ENABLED && !!resolveSpeechApiKey();
}

/**
 * OpenAI Whisper transcription. Pass `deps` in tests to inject key/fetch.
 */
export async function transcribeWithWhisper(
  buf: Buffer,
  mimeType: string,
  filename: string,
  deps: WhisperDeps = {}
): Promise<TranscribeResult> {
  const apiKey = deps.apiKey !== undefined ? deps.apiKey : resolveSpeechApiKey();
  if (!apiKey) {
    throw Object.assign(new Error("Speech STT is not configured"), { code: "SPEECH_NOT_CONFIGURED" });
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = deps.model ?? env.SPEECH_OPENAI_MODEL;

  const form = new FormData();
  const blob = new Blob([new Uint8Array(buf)], { type: mimeType });
  form.append("file", blob, filename || "audio.webm");
  form.append("model", model);
  form.append("response_format", "verbose_json");

  const res = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error(`Whisper failed (${res.status}): ${detail.slice(0, 200)}`), {
      code: "SPEECH_PROVIDER_ERROR",
      status: res.status
    });
  }

  const data = (await res.json()) as { text?: string; language?: string };
  const text = (data.text ?? "").trim();
  if (!text) {
    throw Object.assign(new Error("Empty transcript"), { code: "SPEECH_EMPTY" });
  }
  return { text, language: data.language ?? null };
}

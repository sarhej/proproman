import { describe, it, expect, vi } from "vitest";
import { transcribeWithWhisper } from "./whisperClient.js";

describe("transcribeWithWhisper", () => {
  it("posts multipart to OpenAI and returns text + language", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  Hello world  ", language: "en" })
    });

    const result = await transcribeWithWhisper(
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      "audio/webm",
      "clip.webm",
      { apiKey: "sk-test", model: "whisper-1", fetchImpl: fetchImpl as unknown as typeof fetch }
    );

    expect(result.text).toBe("Hello world");
    expect(result.language).toBe("en");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    );
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("throws SPEECH_NOT_CONFIGURED without key", async () => {
    await expect(
      transcribeWithWhisper(Buffer.from([1]), "audio/webm", "a.webm", { apiKey: null })
    ).rejects.toMatchObject({ code: "SPEECH_NOT_CONFIGURED" });
  });

  it("throws SPEECH_PROVIDER_ERROR on non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized"
    });
    await expect(
      transcribeWithWhisper(Buffer.from([1]), "audio/webm", "a.webm", {
        apiKey: "sk-x",
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    ).rejects.toMatchObject({ code: "SPEECH_PROVIDER_ERROR" });
  });
});

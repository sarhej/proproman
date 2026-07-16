import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VoiceMicButton } from "./VoiceMicButton";

const getVoiceStatus = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    getVoiceStatus: (...args: unknown[]) => getVoiceStatus(...args)
  }
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k })
}));

describe("VoiceMicButton", () => {
  beforeEach(() => {
    getVoiceStatus.mockReset();
  });

  it("renders Mic when speech is enabled", async () => {
    getVoiceStatus.mockResolvedValue({ enabled: true });
    render(<VoiceMicButton mode="attachment" target={{ featureId: "f1" }} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "attachments.voice.mic" })).toBeTruthy();
    });
  });

  it("hides when speech is disabled", async () => {
    getVoiceStatus.mockResolvedValue({ enabled: false });
    const { container } = render(
      <VoiceMicButton mode="attachment" target={{ featureId: "f1" }} />
    );
    await waitFor(() => {
      expect(getVoiceStatus).toHaveBeenCalled();
    });
    expect(container.querySelector("button")).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { api } from "../../lib/api";
import { AttachmentPanel } from "./AttachmentPanel";

vi.mock("../../lib/api", () => ({
  api: {
    getAttachmentLinks: vi.fn().mockResolvedValue({ attachmentLinks: [] }),
    uploadAttachment: vi.fn().mockImplementation(async (_file: File, meta?: { kind?: string }) => ({
      attachment: {
        id: meta?.kind === "ANNOTATED" ? "att-annotated" : "att-original",
        filename: "x.png",
        kind: meta?.kind ?? "ORIGINAL"
      },
      link: { id: "link-1" }
    })),
    createAttachmentLink: vi.fn(),
    deleteAttachmentLink: vi.fn(),
    listAttachments: vi.fn(),
    getVoiceStatus: vi.fn().mockResolvedValue({ enabled: false })
  },
  attachmentContentUrl: (id: string) => `/api/attachments/${id}/content`
}));

vi.mock("./ImageAnnotatorDialog", () => ({
  ImageAnnotatorDialog: ({
    open,
    onSave
  }: {
    open: boolean;
    onSave: (f: File) => void | Promise<void>;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          void onSave(new File([new Uint8Array([9, 9, 9])], "image-annotated.png", { type: "image/png" }))
        }
      >
        mock-save-annotated
      </button>
    ) : null
}));

function pngFile(): File {
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    ),
    (c) => c.charCodeAt(0)
  );
  return new File([bytes], "image.png", { type: "image/png" });
}

describe("AttachmentPanel annotate save (dual upload)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAttachmentLinks).mockResolvedValue({ attachmentLinks: [] });
  });

  it("uploads ORIGINAL then ANNOTATED with parentAttachmentId (both linked)", async () => {
    const { container } = render(<AttachmentPanel target={{ featureId: "feat-1" }} />);
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });

    fireEvent.click(await screen.findByRole("button", { name: /annotate/i }));
    fireEvent.click(await screen.findByRole("button", { name: /mock-save-annotated/i }));

    await waitFor(() => {
      expect(api.uploadAttachment).toHaveBeenCalledTimes(2);
    });

    const calls = vi.mocked(api.uploadAttachment).mock.calls;
    expect(calls[0][1]).toMatchObject({
      kind: "ORIGINAL",
      featureId: "feat-1"
    });
    expect(calls[1][0].name).toBe("image-annotated.png");
    expect(calls[1][1]).toMatchObject({
      kind: "ANNOTATED",
      parentAttachmentId: "att-original",
      featureId: "feat-1"
    });
  });
});

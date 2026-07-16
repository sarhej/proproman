import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AttachmentPanel } from "./AttachmentPanel";

vi.mock("../../lib/api", () => ({
  api: {
    getAttachmentLinks: vi.fn().mockResolvedValue({ attachmentLinks: [] }),
    uploadAttachment: vi.fn(),
    createAttachmentLink: vi.fn(),
    deleteAttachmentLink: vi.fn(),
    listAttachments: vi.fn()
  },
  attachmentContentUrl: (id: string) => `/api/attachments/${id}/content`
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

describe("AttachmentPanel capture preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an <img> with a blob: object URL after file select (StrictMode)", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = ((blob: Blob | MediaSource) => {
      const url = origCreate(blob);
      created.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      revoked.push(url);
      origRevoke(url);
    }) as typeof URL.revokeObjectURL;

    try {
      const { container } = render(
        <StrictMode>
          <AttachmentPanel target={{ featureId: "f1" }} />
        </StrictMode>
      );

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      fireEvent.change(input, { target: { files: [pngFile()] } });

      const img = await screen.findByRole("img", { name: "image.png" });
      expect(img).toHaveAttribute("src");
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith("blob:")).toBe(true);
      // Live URL must not be among revoked (StrictMode may revoke an earlier one)
      expect(revoked.includes(src)).toBe(false);
      expect(created.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});

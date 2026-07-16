import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18n from "../../i18n";
import { ImageAnnotatorDialog, loadAnnotatorSource } from "./ImageAnnotatorDialog";

function pngFile(): File {
  // 1x1 PNG
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    ),
    (c) => c.charCodeAt(0)
  );
  return new File([bytes], "shot.png", { type: "image/png" });
}

describe("loadAnnotatorSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads via createImageBitmap without relying on object URLs", async () => {
    const close = vi.fn();
    const bitmap = { width: 120, height: 80, close } as unknown as ImageBitmap;
    const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const file = pngFile();
    const source = await loadAnnotatorSource(file);
    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(source.width).toBe(120);
    expect(source.height).toBe(80);

    const drawImage = vi.fn();
    source.draw({ drawImage } as unknown as CanvasRenderingContext2D);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    source.dispose?.();
    expect(close).toHaveBeenCalled();
  });

  it("rejects empty bitmaps", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 0, height: 0, close: vi.fn() })
    );
    await expect(loadAnnotatorSource(pngFile())).rejects.toThrow("empty_image");
  });
});

describe("ImageAnnotatorDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    const close = vi.fn();
    const bitmap = { width: 200, height: 100, close } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      lineCap: "round",
      font: ""
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws the loaded image onto the canvas (not a blank box)", async () => {
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      lineCap: "round",
      font: ""
    });

    render(<ImageAnnotatorDialog open imageFile={pngFile()} onClose={() => {}} onSave={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save annotated/i })).toBeEnabled();
    });
    const canvas = document.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas?.width).toBe(200);
    expect(canvas?.height).toBe(100);
    expect(drawImage).toHaveBeenCalled();
  });
});

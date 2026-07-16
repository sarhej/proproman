import { describe, it, expect, vi, afterEach } from "vitest";
import { bakeAnnotatedPng, drawAnnotatorStrokes } from "./annotatorBake";

function mockCanvas(strokeRect = vi.fn()) {
  const ctx = {
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeRect,
    fillText: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineCap: "round",
    font: ""
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(ctx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => {
      cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    })
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, strokeRect };
}

describe("drawAnnotatorStrokes", () => {
  it("draws rect strokes onto the context", () => {
    const { ctx, strokeRect } = mockCanvas();
    drawAnnotatorStrokes(
      ctx as unknown as CanvasRenderingContext2D,
      [{ tool: "rect", color: "#dc2626", x: 1, y: 2, w: 10, h: 20 }],
      400
    );
    expect(strokeRect).toHaveBeenCalledWith(1, 2, 10, 20);
  });
});

describe("bakeAnnotatedPng", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("decodes the file fresh, draws strokes, and returns *-annotated.png", async () => {
    const close = vi.fn();
    const bitmap = { width: 100, height: 80, close } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const { canvas, ctx, strokeRect } = mockCanvas();
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    const out = await bakeAnnotatedPng(
      file,
      [{ tool: "rect", color: "#dc2626", x: 5, y: 5, w: 40, h: 30 }],
      () => canvas
    );

    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(strokeRect).toHaveBeenCalledWith(5, 5, 40, 30);
    expect(out.name).toBe("shot-annotated.png");
    expect(out.type).toBe("image/png");
    expect(close).toHaveBeenCalled();
  });

  it("still produces a PNG when strokes are empty (original picture layer unchanged in bake)", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 10, height: 10, close } as unknown as ImageBitmap)
    );
    const { canvas, strokeRect } = mockCanvas();
    const out = await bakeAnnotatedPng(
      new File([new Uint8Array([1])], "a.webp", { type: "image/webp" }),
      [],
      () => canvas
    );
    expect(strokeRect).not.toHaveBeenCalled();
    expect(out.name).toBe("a-annotated.png");
    expect(close).toHaveBeenCalled();
  });

  it("throws bake_failed when toBlob returns null", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap)
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 1,
        lineCap: "round",
        font: ""
      }),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null))
    } as unknown as HTMLCanvasElement;

    await expect(
      bakeAnnotatedPng(new File([new Uint8Array([1])], "x.png", { type: "image/png" }), [], () => canvas)
    ).rejects.toThrow("bake_failed");
  });
});

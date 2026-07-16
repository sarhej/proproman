/** Annotation stroke primitives shared by the dialog and bake path. */
export type AnnotatorTool = "pen" | "arrow" | "rect" | "text";

export type AnnotatorStroke =
  | { tool: "pen"; color: string; points: { x: number; y: number }[] }
  | { tool: "arrow"; color: string; x1: number; y1: number; x2: number; y2: number }
  | { tool: "rect"; color: string; x: number; y: number; w: number; h: number }
  | { tool: "text"; color: string; x: number; y: number; text: string };

export function drawAnnotatorStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: AnnotatorStroke[],
  canvasWidth: number
) {
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(2, Math.round(canvasWidth / 400));
    ctx.lineCap = "round";
    if (s.tool === "pen") {
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    } else if (s.tool === "rect") {
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.tool === "arrow") {
      drawArrow(ctx, s.x1, s.y1, s.x2, s.y2);
    } else if (s.tool === "text") {
      ctx.font = `${Math.max(14, Math.round(canvasWidth / 40))}px sans-serif`;
      ctx.fillText(s.text, s.x, s.y);
    }
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const head = Math.max(8, Math.hypot(x2 - x1, y2 - y1) * 0.08);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/**
 * Bake annotations onto a FRESH decode of `imageFile`.
 * Does not use the display canvas or a possibly-detached ImageBitmap from the dialog.
 */
export async function bakeAnnotatedPng(
  imageFile: File,
  strokes: AnnotatorStroke[],
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")
): Promise<File> {
  const bitmap = await createImageBitmap(imageFile);
  try {
    if (!bitmap.width || !bitmap.height) {
      throw new Error("empty_image");
    }
    const canvas = createCanvas();
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_2d_context");
    ctx.drawImage(bitmap, 0, 0);
    drawAnnotatorStrokes(ctx, strokes, canvas.width);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
    if (!blob) throw new Error("bake_failed");
    const name = imageFile.name.replace(/\.[^.]+$/, "") + "-annotated.png";
    return new File([blob], name, { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

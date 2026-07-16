import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

type Tool = "pen" | "arrow" | "rect" | "text";

type Props = {
  open: boolean;
  imageFile: File;
  onClose: () => void;
  onSave: (annotatedPng: File) => void;
};

type Stroke =
  | { tool: "pen"; color: string; points: { x: number; y: number }[] }
  | { tool: "arrow"; color: string; x1: number; y1: number; x2: number; y2: number }
  | { tool: "rect"; color: string; x: number; y: number; w: number; h: number }
  | { tool: "text"; color: string; x: number; y: number; text: string };

type SourceImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
  dispose?: () => void;
};

const COLORS = ["#dc2626", "#eab308", "#0f172a"];

/**
 * Load a File into a drawable source without blob-URL revoke races
 * (React Strict Mode was blanking the canvas when Object URLs were revoked mid-decode).
 */
export async function loadAnnotatorSource(file: File): Promise<SourceImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      throw new Error("empty_image");
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx) => ctx.drawImage(bitmap, 0, 0),
      dispose: () => bitmap.close()
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_load_failed"));
      img.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("empty_image");
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (ctx) => ctx.drawImage(image, 0, 0)
    };
  } finally {
    // Safe: bitmap is already decoded into the HTMLImageElement.
    URL.revokeObjectURL(url);
  }
}

/**
 * Lean canvas annotator — pen / arrow / rect / text → baked PNG.
 */
export function ImageAnnotatorDialog({ open, imageFile, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const drawing = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    current?: Stroke;
  }>({ active: false, startX: 0, startY: 0 });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let owned: SourceImage | null = null;
    setLoading(true);
    setLoadError(null);
    setSource(null);
    setStrokes([]);
    setRedoStack([]);

    void loadAnnotatorSource(imageFile)
      .then((loaded) => {
        if (cancelled) {
          loaded.dispose?.();
          return;
        }
        owned = loaded;
        setSource(loaded);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(t("attachments.annotator.loadFailed"));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      owned?.dispose?.();
      owned = null;
    };
    // intentionally omit `t` — avoid reloading the bitmap on i18n re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageFile]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = source.width;
    canvas.height = source.height;
    source.draw(ctx);
    for (const s of strokes) {
      ctx.strokeStyle = "color" in s ? s.color : color;
      ctx.fillStyle = "color" in s ? s.color : color;
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 400));
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
        ctx.font = `${Math.max(14, Math.round(canvas.width / 40))}px sans-serif`;
        ctx.fillText(s.text, s.x, s.y);
      }
    }
  }, [source, strokes, color]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  if (!open) return null;

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = toCanvasPoint(e);
    drawing.current = { active: true, startX: x, startY: y };
    if (tool === "pen") {
      drawing.current.current = { tool: "pen", color, points: [{ x, y }] };
    } else if (tool === "text") {
      const text = window.prompt(t("attachments.annotator.textPrompt"), "");
      if (text) {
        setStrokes((s) => [...s, { tool: "text", color, x, y, text }]);
        setRedoStack([]);
      }
      drawing.current.active = false;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current.active) return;
    const { x, y } = toCanvasPoint(e);
    if (tool === "pen" && drawing.current.current?.tool === "pen") {
      drawing.current.current.points.push({ x, y });
      setStrokes((prev) => {
        const next = [...prev];
        const last = drawing.current.current;
        if (last) {
          if (next.length && next[next.length - 1] === last) {
            next[next.length - 1] = last;
          } else {
            next.push(last);
          }
        }
        return [...next];
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current.active) return;
    const { x, y } = toCanvasPoint(e);
    const { startX, startY } = drawing.current;
    if (tool === "rect") {
      setStrokes((s) => [
        ...s,
        { tool: "rect", color, x: startX, y: startY, w: x - startX, h: y - startY }
      ]);
      setRedoStack([]);
    } else if (tool === "arrow") {
      setStrokes((s) => [...s, { tool: "arrow", color, x1: startX, y1: startY, x2: x, y2: y }]);
      setRedoStack([]);
    } else if (tool === "pen" && drawing.current.current?.tool === "pen") {
      const stroke = drawing.current.current;
      setStrokes((prev) => {
        if (prev[prev.length - 1] === stroke) return prev;
        return [...prev.filter((p) => p !== stroke), stroke];
      });
      setRedoStack([]);
    }
    drawing.current = { active: false, startX: 0, startY: 0 };
  };

  const undo = () => {
    setStrokes((s) => {
      if (!s.length) return s;
      const next = s.slice(0, -1);
      setRedoStack((r) => [...r, s[s.length - 1]]);
      return next;
    });
  };

  const redo = () => {
    setRedoStack((r) => {
      if (!r.length) return r;
      const last = r[r.length - 1];
      setStrokes((s) => [...s, last]);
      return r.slice(0, -1);
    });
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = imageFile.name.replace(/\.[^.]+$/, "") + "-annotated.png";
        onSave(new File([blob], name, { type: "image/png" }));
      },
      "image/png",
      0.92
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
          <span className="mr-2 text-sm font-semibold text-slate-800">{t("attachments.annotator.title")}</span>
          {(["pen", "arrow", "rect", "text"] as Tool[]).map((toolName) => (
            <Button
              key={toolName}
              type="button"
              size="sm"
              variant={tool === toolName ? "primary" : "secondary"}
              onClick={() => setTool(toolName)}
            >
              {t(`attachments.annotator.tool.${toolName}`)}
            </Button>
          ))}
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-sky-500" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={!strokes.length}>
            {t("attachments.annotator.undo")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={!redoStack.length}>
            {t("attachments.annotator.redo")}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={save} disabled={!source || !!loadError}>
              {t("attachments.annotator.save")}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-3">
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">{t("common.loading")}</p>
          ) : null}
          {loadError ? (
            <p className="py-12 text-center text-sm text-rose-600" role="alert">
              {loadError}
            </p>
          ) : null}
          {!loading && !loadError ? (
            <canvas
              ref={canvasRef}
              className="mx-auto max-h-[70vh] max-w-full cursor-crosshair touch-none bg-white shadow"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
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

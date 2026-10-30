/**
 * Pixel-by-pixel touch-ups on an 88x31 image: pencil, eraser, fill, eyedropper,
 * line and rectangle, with undo/redo. The image is plain RGBA (`Pixels`); the
 * parent owns it and gets every finished stroke through `onChange`.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Eraser,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Slash,
  Square,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../../components/ui.tsx";
import {
  clonePixels,
  floodFill,
  getPixel,
  hexToRgba,
  linePoints,
  rectPoints,
  rgbaToHex,
  setPixel,
  TRANSPARENT,
  type Pixels,
} from "./pixels.ts";

type Tool = "pencil" | "eraser" | "fill" | "picker" | "line" | "rect";

const TOOLS: { id: Tool; label: string; icon: LucideIcon }[] = [
  { id: "pencil", label: "Pencil", icon: Pencil },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "fill", label: "Fill", icon: PaintBucket },
  { id: "picker", label: "Pick a color", icon: Pipette },
  { id: "line", label: "Line", icon: Slash },
  { id: "rect", label: "Rectangle", icon: Square },
];

/** Classic 16-color web palette. */
const PALETTE = [
  "#000000",
  "#808080",
  "#c0c0c0",
  "#ffffff",
  "#800000",
  "#ff0000",
  "#808000",
  "#ffff00",
  "#008000",
  "#00ff00",
  "#008080",
  "#00ffff",
  "#000080",
  "#0000ff",
  "#800080",
  "#ff00ff",
];

const ZOOM = 8;
const MAX_HISTORY = 50;

/** Draw pixels onto the zoomed display canvas, with a checkerboard under transparency and a grid. */
function paint(canvas: HTMLCanvasElement, p: Pixels) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const [r, g, b, a] = getPixel(p, x, y);
      ctx.fillStyle = (x + y) % 2 ? "#e5e5e5" : "#fafafa";
      ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      if (a) {
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      }
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let x = 1; x < p.width; x++) ctx.fillRect(x * ZOOM, 0, 1, canvas.height);
  for (let y = 1; y < p.height; y++) ctx.fillRect(0, y * ZOOM, canvas.width, 1);
}

export function PixelPainter({
  value,
  onChange,
}: {
  value: Pixels;
  onChange: (pixels: Pixels) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#000000");
  const [recent, setRecent] = useState<string[]>([]);
  const [undo, setUndo] = useState<Pixels[]>([]);
  const [redo, setRedo] = useState<Pixels[]>([]);
  // The stroke in progress: where it started, and the image before it.
  const stroke = useRef<{ start: [number, number]; before: Pixels; draft: Pixels } | null>(null);

  useEffect(() => {
    if (canvasRef.current && !stroke.current) paint(canvasRef.current, value);
  }, [value]);

  const rememberColor = useCallback((hex: string) => {
    setColor(hex);
    setRecent((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, 8));
  }, []);

  const commit = (before: Pixels, after: Pixels) => {
    setUndo((u) => [...u, before].slice(-MAX_HISTORY));
    setRedo([]);
    onChange(after);
  };

  const at = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.floor(((e.clientX - rect.left) / rect.width) * value.width),
      Math.floor(((e.clientY - rect.top) / rect.height) * value.height),
    ];
  };

  /** Apply the current tool to `draft` for the stroke so far, ending at (x, y). */
  const apply = (draft: Pixels, before: Pixels, start: [number, number], x: number, y: number) => {
    const ink = tool === "eraser" ? TRANSPARENT : hexToRgba(color);
    if (tool === "line" || tool === "rect") {
      // Shapes are redrawn from the original each move, so they follow the pointer.
      draft.data.set(before.data);
      const pts = tool === "line" ? linePoints(...start, x, y) : rectPoints(...start, x, y);
      for (const [px, py] of pts) setPixel(draft, px, py, ink);
    } else {
      setPixel(draft, x, y, ink);
    }
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = at(e);
    if (tool === "picker") {
      const c = getPixel(value, x, y);
      if (c[3]) rememberColor(rgbaToHex(c));
      setTool("pencil");
      return;
    }
    if (tool === "fill") {
      const after = clonePixels(value);
      floodFill(after, x, y, hexToRgba(color));
      commit(value, after);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const draft = clonePixels(value);
    stroke.current = { start: [x, y], before: value, draft };
    apply(draft, value, [x, y], x, y);
    if (canvasRef.current) paint(canvasRef.current, draft);
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!s) return;
    const [x, y] = at(e);
    if (tool === "pencil" || tool === "eraser") {
      // Fill gaps when the pointer moves faster than one pixel per event.
      const last = s.start;
      for (const [px, py] of linePoints(...last, x, y)) apply(s.draft, s.before, s.start, px, py);
      s.start = [x, y];
    } else {
      apply(s.draft, s.before, s.start, x, y);
    }
    if (canvasRef.current) paint(canvasRef.current, s.draft);
  };

  const up = () => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    if (tool !== "eraser") rememberColor(color);
    commit(s.before, s.draft);
  };

  const step = (from: Pixels[], to: Pixels[], setFrom: typeof setUndo, setTo: typeof setUndo) => {
    const prev = from.at(-1);
    if (!prev) return;
    setFrom(from.slice(0, -1));
    setTo([...to, value]);
    onChange(prev);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={`rounded-md border p-2 ${
              tool === t.id
                ? "border-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                : "border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            <t.icon size={16} aria-hidden />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-700" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          disabled={!undo.length}
          onClick={() => step(undo, redo, setUndo, setRedo)}
        >
          <Undo2 size={14} /> Undo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!redo.length}
          onClick={() => step(redo, undo, setRedo, setUndo)}
        >
          <Redo2 size={14} /> Redo
        </Button>
      </div>

      <div className="overflow-x-auto">
        <canvas
          ref={canvasRef}
          width={value.width * ZOOM}
          height={value.height * ZOOM}
          className="block max-w-full cursor-crosshair touch-none rounded border border-neutral-300 dark:border-neutral-700"
          style={{ imageRendering: "pixelated" }}
          aria-label="Badge pixels. Use the tools above to draw."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700"
          />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Palette">
          {[...recent, ...PALETTE.filter((c) => !recent.includes(c))].map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`Use ${c}`}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded border ${
                c === color
                  ? "border-sky-500 ring-2 ring-sky-400"
                  : "border-neutral-300 dark:border-neutral-600"
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

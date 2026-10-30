/**
 * Draws a badge design (`BadgeSource`) onto an 88x31 canvas: background,
 * picture, border, then text. Used for the live preview and for the PNG that
 * gets uploaded, so what you see is exactly what's saved.
 */

import {
  BADGE_HEIGHT as H,
  BADGE_WIDTH as W,
  type BadgePicture,
  type BadgeSource,
  type BadgeText,
} from "../../../shared/badges.ts";
import { BITMAP_FONT_HEIGHT, drawBitmapText, measureBitmapText } from "./pixelFont.ts";

/** A loaded picture, by media rkey. */
export type LoadedPictures = Map<string, HTMLImageElement | ImageBitmap>;

const SYSTEM_FONTS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Courier New", monospace',
} as const;

/**
 * Where a picture of `iw` x `ih` lands inside its box, per its fit. Any slack
 * (or, for "cover", the overflow that gets cropped) is split per the focus.
 */
export function fitRect(
  box: Pick<BadgePicture, "x" | "y" | "w" | "h" | "fit" | "focusX" | "focusY">,
  iw: number,
  ih: number,
): { x: number; y: number; w: number; h: number } {
  if (box.fit === "stretch" || !iw || !ih) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const scale = (box.fit === "cover" ? Math.max : Math.min)(box.w / iw, box.h / ih);
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);
  const fx = (box.focusX ?? 50) / 100;
  const fy = (box.focusY ?? 50) / 100;
  return { x: box.x + Math.round((box.w - w) * fx), y: box.y + Math.round((box.h - h) * fy), w, h };
}

/** Left edge of a text line, given its anchor and alignment. */
export function textLeft(t: Pick<BadgeText, "x" | "align">, width: number): number {
  if (t.align === "center") return Math.round(t.x - width / 2);
  if (t.align === "right") return t.x - width;
  return t.x;
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: BadgeSource["background"]) {
  if (bg.to) {
    const g =
      bg.direction === "horizontal"
        ? ctx.createLinearGradient(0, 0, W, 0)
        : ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = bg.from;
  }
  ctx.fillRect(0, 0, W, H);
}

function drawImage(ctx: CanvasRenderingContext2D, image: BadgePicture, images: LoadedPictures) {
  const img = images.get(image.media);
  if (!img) return;
  const r = fitRect(image, img.width, img.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(image.x, image.y, image.w, image.h);
  ctx.clip();
  // Smooth when shrinking photos; keep pixel art crisp when enlarging it.
  ctx.imageSmoothingEnabled = r.w < img.width;
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function edges(ctx: CanvasRenderingContext2D, inset: number, topLeft: string, bottomRight: string) {
  const w = W - inset * 2;
  const h = H - inset * 2;
  ctx.fillStyle = topLeft;
  ctx.fillRect(inset, inset, w, 1);
  ctx.fillRect(inset, inset, 1, h);
  ctx.fillStyle = bottomRight;
  ctx.fillRect(inset, inset + h - 1, w, 1);
  ctx.fillRect(inset + w - 1, inset, 1, h);
}

function drawBorder(ctx: CanvasRenderingContext2D, source: BadgeSource) {
  if (source.border === "none") return;
  const c = source.borderColor;
  edges(ctx, 0, c, c);
  const light = "rgba(255,255,255,0.65)";
  const dark = "rgba(0,0,0,0.4)";
  if (source.border === "bevel") edges(ctx, 1, light, dark);
  if (source.border === "inset") edges(ctx, 1, dark, light);
}

function drawText(ctx: CanvasRenderingContext2D, t: BadgeText) {
  if (!t.text) return;
  const passes: [string, number][] = t.shadow
    ? [
        [t.shadow, 1],
        [t.color, 0],
      ]
    : [[t.color, 0]];
  if (t.font === "pixel" || t.font === "tiny") {
    const left = textLeft(t, measureBitmapText(t.text, t.font));
    for (const [color, d] of passes) {
      ctx.fillStyle = color;
      drawBitmapText(ctx, t.text, t.font, left + d, t.y + d);
    }
    return;
  }
  ctx.font = `${t.size}px ${SYSTEM_FONTS[t.font]}`;
  ctx.textBaseline = "top";
  ctx.textAlign = t.align;
  for (const [color, d] of passes) {
    ctx.fillStyle = color;
    ctx.fillText(t.text, t.x + d, t.y + d);
  }
}

/** Draw the whole design. `ctx` must be on an 88x31 canvas. */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  source: BadgeSource,
  images: LoadedPictures,
): void {
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, source.background);
  if (source.image) drawImage(ctx, source.image, images);
  drawBorder(ctx, source);
  for (const t of source.texts) drawText(ctx, t);
}

/** Height of a text line in pixels, for placing it (system fonts are roughly their size). */
export function textHeight(t: Pick<BadgeText, "font" | "size">): number {
  return t.font === "pixel" || t.font === "tiny" ? BITMAP_FONT_HEIGHT[t.font] : t.size;
}

export function newCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  return canvas;
}

/** A canvas as a PNG file, ready for `api.uploadMedia`. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], "badge.png", { type: "image/png" }));
      else reject(new Error("Couldn't make the image."));
    }, "image/png");
  });
}

/**
 * Load an image from a usercontent URL for drawing. Needs CORS, or the canvas
 * becomes "tainted" and can't be saved; media responses allow it.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load that picture."));
    img.src = url;
  });
}

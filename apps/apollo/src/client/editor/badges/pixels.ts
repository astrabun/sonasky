/**
 * Pixel operations for the badge maker's painter. Works on plain RGBA buffers
 * (the same layout as ImageData) so it can be tested without a DOM.
 */

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** [r, g, b, a], 0-255 each. Transparent is [0, 0, 0, 0]. */
export type Rgba = [number, number, number, number];

export const TRANSPARENT: Rgba = [0, 0, 0, 0];

export function blankPixels(width: number, height: number): Pixels {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function clonePixels(p: Pixels): Pixels {
  return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
}

export function inBounds(p: Pixels, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < p.width && y < p.height;
}

export function getPixel(p: Pixels, x: number, y: number): Rgba {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

export function setPixel(p: Pixels, x: number, y: number, c: Rgba): void {
  if (!inBounds(p, x, y)) return;
  p.data.set(c, (y * p.width + x) * 4);
}

function same(a: Rgba, b: Rgba): boolean {
  // Every fully transparent pixel counts as the same color.
  if (a[3] === 0 && b[3] === 0) return true;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** Fill the 4-connected area of the color under (x, y). */
export function floodFill(p: Pixels, x: number, y: number, c: Rgba): void {
  if (!inBounds(p, x, y)) return;
  const target = getPixel(p, x, y);
  if (same(target, c)) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop() as number[];
    if (!inBounds(p, px, py) || !same(getPixel(p, px, py), target)) continue;
    setPixel(p, px, py, c);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

/** Points on the line from (x0, y0) to (x1, y1), ends included (Bresenham). */
// https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Points on the outline of the rectangle with corners (x0, y0) and (x1, y1). */
export function rectPoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [t, b] = [Math.min(y0, y1), Math.max(y0, y1)];
  return [
    ...linePoints(l, t, r, t),
    ...linePoints(l, b, r, b),
    ...linePoints(l, t, l, b),
    ...linePoints(r, t, r, b),
  ];
}

export function hexToRgba(hex: string): Rgba {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex(c: Rgba): string {
  return `#${[c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

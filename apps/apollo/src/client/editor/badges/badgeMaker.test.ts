import { describe, expect, it } from "vitest";
import { fitRect, textLeft } from "./compose.ts";
import { drawBitmapText, measureBitmapText, type PixelTarget } from "./pixelFont.ts";
import {
  blankPixels,
  floodFill,
  getPixel,
  hexToRgba,
  linePoints,
  rectPoints,
  rgbaToHex,
  setPixel,
} from "./pixels.ts";

function recorder(): PixelTarget & { points: string[] } {
  const points: string[] = [];
  return { fillStyle: "", fillRect: (x, y) => points.push(`${x},${y}`), points };
}

describe("bitmap fonts", () => {
  it("measures proportionally, with 1px between glyphs", () => {
    // "I" trims to 3 columns, "1" to 3; a space is 3 wide.
    expect(measureBitmapText("I", "pixel")).toBe(3);
    expect(measureBitmapText("II", "pixel")).toBe(7);
    expect(measureBitmapText("I I", "pixel")).toBe(11);
    expect(measureBitmapText("", "pixel")).toBe(0);
  });
  it("draws the glyph's inked pixels", () => {
    const t = recorder();
    drawBitmapText(t, "-", "pixel", 10, 20);
    // "-" is a 5-wide bar on row 3.
    expect(t.points).toEqual(["10,23", "11,23", "12,23", "13,23", "14,23"]);
  });
  it("falls back to ? for characters the font doesn't have", () => {
    const unknown = recorder();
    const question = recorder();
    drawBitmapText(unknown, "é", "tiny", 0, 0);
    drawBitmapText(question, "?", "tiny", 0, 0);
    expect(unknown.points).toEqual(question.points);
  });
  it("draws tiny text with its own lowercase and descenders", () => {
    const t = recorder();
    drawBitmapText(t, "I", "tiny", 0, 0);
    expect(t.points).toHaveLength(3 + 1 + 1 + 1 + 3);
    // "j" hangs one row below the baseline, into the font's sixth row.
    const j = recorder();
    drawBitmapText(j, "j", "tiny", 0, 0);
    expect(j.points).toContain("1,5");
  });
  it("uses Tom Thumb's spacing, with 1px between glyphs", () => {
    // "i" is 1 column wide, "m" 3.
    expect(measureBitmapText("i", "tiny")).toBe(1);
    expect(measureBitmapText("im", "tiny")).toBe(5);
  });
});

describe("layout helpers", () => {
  it("fits pictures into their box", () => {
    const box = { x: 0, y: 0, w: 88, h: 31 };
    expect(fitRect({ ...box, fit: "contain" }, 100, 100)).toEqual({ x: 29, y: 0, w: 31, h: 31 });
    expect(fitRect({ ...box, fit: "cover" }, 100, 100)).toEqual({ x: 0, y: -28, w: 88, h: 88 });
    expect(fitRect({ ...box, fit: "stretch" }, 100, 100)).toEqual(box);
  });
  it("keeps the focused part of a cropped or letterboxed picture in view", () => {
    const box = { x: 0, y: 0, w: 88, h: 31 };
    // A square picture filling 88x31 is 88x88; focus 0 shows its top, 100 its bottom.
    expect(fitRect({ ...box, fit: "cover", focusY: 0 }, 100, 100).y).toBe(0);
    expect(fitRect({ ...box, fit: "cover", focusY: 100 }, 100, 100).y).toBe(-57);
    expect(fitRect({ ...box, fit: "contain", focusX: 0 }, 100, 100).x).toBe(0);
    expect(fitRect({ ...box, fit: "contain", focusX: 100 }, 100, 100).x).toBe(57);
  });
  it("anchors text by alignment", () => {
    expect(textLeft({ x: 44, align: "center" }, 20)).toBe(34);
    expect(textLeft({ x: 80, align: "right" }, 20)).toBe(60);
    expect(textLeft({ x: 3, align: "left" }, 20)).toBe(3);
  });
});

describe("pixels", () => {
  it("flood fills only the connected area", () => {
    const p = blankPixels(5, 3);
    const wall = hexToRgba("#000000");
    for (let y = 0; y < 3; y++) setPixel(p, 2, y, wall);
    floodFill(p, 0, 0, hexToRgba("#ff0000"));
    expect(rgbaToHex(getPixel(p, 1, 2))).toBe("#ff0000");
    expect(getPixel(p, 4, 0)[3]).toBe(0);
    expect(rgbaToHex(getPixel(p, 2, 1))).toBe("#000000");
  });
  it("draws lines and rectangles", () => {
    expect(linePoints(0, 0, 3, 1)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    expect(new Set(rectPoints(0, 0, 2, 2).map(String)).size).toBe(8);
  });
});

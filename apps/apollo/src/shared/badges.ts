/**
 * 88x31 badges (the little web buttons): the editable design stored on a badge
 * record (`source`) and the at:// uris a badges block points at. Shared by the
 * Worker (which rebuilds `source` from known fields before writing) and the
 * badge maker (which draws it).
 */

import { HEX_COLOR_RE } from "@sonasky/apollo-themes";
import { linkValueError } from "./links.ts";
import { NSID_BADGE } from "./nsid.ts";

export const BADGE_WIDTH = 88;
export const BADGE_HEIGHT = 31;

export const BADGE_FONTS = ["pixel", "tiny", "sans", "serif", "mono"] as const;
export type BadgeFont = (typeof BADGE_FONTS)[number];

export const BADGE_BORDERS = ["none", "line", "bevel", "inset"] as const;
export type BadgeBorder = (typeof BADGE_BORDERS)[number];

export const BADGE_FITS = ["contain", "cover", "stretch"] as const;
export type BadgeFit = (typeof BADGE_FITS)[number];

export const BADGE_ALIGNS = ["left", "center", "right"] as const;
export type BadgeAlign = (typeof BADGE_ALIGNS)[number];

/** Text lines one design can have. */
export const BADGE_MAX_TEXTS = 2;
const TEXT_MAX_CHARS = 40;

export interface BadgeText {
  text: string;
  color: string;
  /** 1px drop shadow color; unset means no shadow. */
  shadow?: string;
  font: BadgeFont;
  /** Pixel size for the system fonts (ignored by the bitmap fonts). */
  size: number;
  /** Anchor point: `x` is the left / center / right edge per `align`, `y` the top. */
  x: number;
  y: number;
  align: BadgeAlign;
}

export interface BadgePicture {
  /** Media rkey in the same repo. */
  media: string;
  fit: BadgeFit;
  /** Box the picture is fitted into. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Which part of the picture to keep in view when it doesn't exactly fill
   * the box, as percentages: 0 = left / top edge, 100 = right / bottom.
   * Unset means 50 (centered). Ignored for "stretch".
   */
  focusX?: number;
  focusY?: number;
}

export interface BadgeSource {
  background: {
    from: string;
    /** Second gradient stop; unset means a solid fill. */
    to?: string;
    direction?: "horizontal" | "vertical";
  };
  border: BadgeBorder;
  borderColor: string;
  image?: BadgePicture;
  texts: BadgeText[];
  /** The design was touched up pixel-by-pixel after composing; `source` alone no longer reproduces it. */
  pixelEdited?: true;
}

export function defaultBadgeSource(): BadgeSource {
  return {
    background: { from: "#1d4ed8", to: "#60a5fa", direction: "vertical" },
    border: "bevel",
    borderColor: "#0f172a",
    texts: [
      {
        text: "MY SITE",
        color: "#ffffff",
        shadow: "#0f172a",
        font: "pixel",
        size: 10,
        x: 44,
        y: 12,
        align: "center",
      },
    ],
  };
}

type Obj = Record<string, unknown>;

const MEDIA_RKEY_RE = /^[a-zA-Z0-9._~:-]{1,512}$/;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function color(v: unknown): string | undefined {
  return typeof v === "string" && HEX_COLOR_RE.test(v) ? v.toLowerCase() : undefined;
}

function pick<T extends string>(v: unknown, values: readonly T[], fallback: T): T {
  return typeof v === "string" && values.includes(v as T) ? (v as T) : fallback;
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
}

/**
 * Rebuild a design from known fields, clamping numbers and dropping anything
 * unrecognized. Returns null when the input isn't a design at all.
 */
export function normalizeBadgeSource(input: unknown): BadgeSource | null {
  if (!isObj(input) || !isObj(input.background)) return null;
  const from = color(input.background.from);
  if (!from) return null;
  const to = color(input.background.to);
  const source: BadgeSource = {
    background: to
      ? {
          from,
          to,
          direction: pick(
            input.background.direction,
            ["horizontal", "vertical"] as const,
            "vertical",
          ),
        }
      : { from },
    border: pick(input.border, BADGE_BORDERS, "none"),
    borderColor: color(input.borderColor) ?? "#000000",
    texts: [],
  };
  if (isObj(input.image) && typeof input.image.media === "string") {
    if (MEDIA_RKEY_RE.test(input.image.media)) {
      const i = input.image;
      source.image = {
        media: i.media as string,
        fit: pick(i.fit, BADGE_FITS, "contain"),
        x: int(i.x, -BADGE_WIDTH, BADGE_WIDTH, 0),
        y: int(i.y, -BADGE_HEIGHT, BADGE_HEIGHT, 0),
        w: int(i.w, 1, BADGE_WIDTH * 4, BADGE_WIDTH),
        h: int(i.h, 1, BADGE_HEIGHT * 4, BADGE_HEIGHT),
      };
      const focusX = int(i.focusX, 0, 100, 50);
      const focusY = int(i.focusY, 0, 100, 50);
      if (focusX !== 50) source.image.focusX = focusX;
      if (focusY !== 50) source.image.focusY = focusY;
    }
  }
  if (Array.isArray(input.texts)) {
    for (const t of input.texts.slice(0, BADGE_MAX_TEXTS)) {
      if (!isObj(t) || typeof t.text !== "string") continue;
      const shadow = color(t.shadow);
      source.texts.push({
        text: [...t.text].slice(0, TEXT_MAX_CHARS).join(""),
        color: color(t.color) ?? "#000000",
        ...(shadow ? { shadow } : {}),
        font: pick(t.font, BADGE_FONTS, "pixel"),
        size: int(t.size, 6, 31, 10),
        x: int(t.x, -BADGE_WIDTH, BADGE_WIDTH * 2, 0),
        y: int(t.y, -BADGE_HEIGHT, BADGE_HEIGHT * 2, 0),
        align: pick(t.align, BADGE_ALIGNS, "left"),
      });
    }
  }
  if (input.pixelEdited === true) source.pixelEdited = true;
  return source;
}

/**
 * A badge's link may also be shown on other people's sites, so only links
 * that mean the same thing anywhere are allowed: http(s), or a page on
 * the owner's own site (resolved against their site wherever it's shown).
 * Returns an error message, or null when it's fine.
 */
export function badgeHrefError(value: string): string | null {
  const v = value.trim();
  if (v.startsWith("#") || v.startsWith("media:")) {
    return "Link to a web page or one of your site's pages.";
  }
  return linkValueError(v);
}

const BADGE_URI_RE =
  /^at:\/\/(did:(?:plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+(?:%3A[0-9]+)?))\/([a-zA-Z0-9.]+)\/([a-zA-Z0-9._~:-]{1,512})$/;

/** `at://<did>/app.sonasky.apollo.badge/<rkey>` -> its parts, or null. */
export function parseBadgeUri(value: unknown): { did: string; rkey: string } | null {
  if (typeof value !== "string") return null;
  const m = BADGE_URI_RE.exec(value);
  if (!m || m[2] !== NSID_BADGE) return null;
  return { did: m[1], rkey: m[3] };
}

export function badgeUri(did: string, rkey: string): string {
  return `at://${did}/${NSID_BADGE}/${rkey}`;
}

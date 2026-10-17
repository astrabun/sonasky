import {
  THEME_FONT_VALUES,
  THEME_RADIUS_VALUES,
  THEME_WIDTH_VALUES,
  type ThemeDefinition,
  type ThemeTokens,
} from "./types.ts";

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
/** Google Fonts family names: letters, digits and single spaces, e.g. "Source Serif 4". */
export const GOOGLE_FONT_RE = /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/;
export const GOOGLE_FONT_MAX_LENGTH = 64;

export function isGoogleFontFamily(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= GOOGLE_FONT_MAX_LENGTH &&
    GOOGLE_FONT_RE.test(value)
  );
}
export const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HANDLE_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/** WCAG 2.x minimum contrast for normal-size text. */
export const MIN_CONTRAST = 4.5;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colors (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The color pairs a theme must keep readable, with plain-language names for errors. */
export function contrastPairs(t: ThemeTokens): { label: string; fg: string; bg: string }[] {
  const link = t.link ?? t.accent;
  return [
    { label: "text on the page background", fg: t.text, bg: t.background },
    { label: "text on cards", fg: t.text, bg: t.surface },
    { label: "softer text on the page background", fg: t.muted, bg: t.background },
    { label: "softer text on cards", fg: t.muted, bg: t.surface },
    { label: "button text on buttons", fg: t.accentText, bg: t.accent },
    { label: "links on the page background", fg: link, bg: t.background },
  ];
}

/**
 * Everything wrong with a theme definition, as human-readable messages. An
 * empty list means it's valid. Run by `pnpm -F @sonasky/apollo-themes test`
 * for every theme in this package.
 */
export function validateTheme(theme: ThemeDefinition): string[] {
  const errors: string[] = [];
  const where = `theme "${theme.id}"`;

  if (!THEME_ID_RE.test(theme.id)) {
    errors.push(`${where}: id must be lowercase letters, numbers and dashes (max 64)`);
  }
  if (!theme.name.trim() || theme.name.length > 40) {
    errors.push(`${where}: name must be 1-40 characters`);
  }
  if (theme.description && theme.description.length > 140) {
    errors.push(`${where}: description must be 140 characters or less`);
  }
  if (!theme.author?.name?.trim()) errors.push(`${where}: author.name is required`);
  if (theme.author?.handle && !HANDLE_RE.test(theme.author.handle)) {
    errors.push(`${where}: author.handle must be a Bluesky handle without the @`);
  }

  const t = theme.tokens;
  const colorKeys = ["background", "surface", "text", "muted", "accent", "accentText"] as const;
  let colorsOk = true;
  for (const key of colorKeys) {
    if (!HEX_COLOR_RE.test(t[key])) {
      errors.push(`${where}: tokens.${key} must be a #rrggbb color`);
      colorsOk = false;
    }
  }
  if (t.link !== undefined && !HEX_COLOR_RE.test(t.link)) {
    errors.push(`${where}: tokens.link must be a #rrggbb color`);
    colorsOk = false;
  }
  if (!THEME_FONT_VALUES.includes(t.fontBody)) errors.push(`${where}: unknown tokens.fontBody`);
  if (!THEME_FONT_VALUES.includes(t.fontHeading))
    errors.push(`${where}: unknown tokens.fontHeading`);
  if (!THEME_RADIUS_VALUES.includes(t.radius)) errors.push(`${where}: unknown tokens.radius`);
  if (!THEME_WIDTH_VALUES.includes(t.width)) errors.push(`${where}: unknown tokens.width`);
  for (const slot of ["body", "heading"] as const) {
    const family = t.googleFonts?.[slot];
    if (family !== undefined && !isGoogleFontFamily(family)) {
      errors.push(`${where}: tokens.googleFonts.${slot} must be a Google Fonts family name`);
    }
  }

  if (colorsOk) {
    for (const pair of contrastPairs(t)) {
      const ratio = contrast(pair.fg, pair.bg);
      if (ratio < MIN_CONTRAST) {
        errors.push(
          `${where}: ${pair.label} is too low-contrast (${ratio.toFixed(2)}:1, needs ${MIN_CONTRAST}:1)`,
        );
      }
    }
  }
  return errors;
}

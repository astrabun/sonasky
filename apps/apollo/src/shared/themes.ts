/**
 * How Apollo renders theme tokens. The theme catalog itself (official +
 * community themes, validation, contrast) lives in @sonasky/apollo-themes.
 */

import { DEFAULT_THEME_ID, findTheme, type ThemeTokens } from "@sonasky/apollo-themes";
import type { ThemeFont, ThemeRadius, ThemeWidth } from "./records.ts";

export {
  ALL_THEMES,
  COMMUNITY_THEMES,
  contrast,
  contrastPairs,
  DEFAULT_THEME_ID,
  findTheme,
  HEX_COLOR_RE,
  isGoogleFontFamily,
  MIN_CONTRAST,
  OFFICIAL_THEMES,
  THEME_ID_RE,
  type ThemeDefinition,
} from "@sonasky/apollo-themes";

export const THEME_FONTS: Record<ThemeFont, { label: string; stack: string }> = {
  sans: {
    label: "Clean",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  serif: {
    label: "Classic",
    stack: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
  },
  mono: {
    label: "Typewriter",
    stack: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
  },
  rounded: {
    label: "Friendly",
    stack: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
  },
};

export const THEME_RADII: Record<ThemeRadius, { label: string; css: string }> = {
  none: { label: "Square", css: "0" },
  small: { label: "Slightly rounded", css: "6px" },
  medium: { label: "Rounded", css: "12px" },
  large: { label: "Very rounded", css: "24px" },
};

export const THEME_WIDTHS: Record<ThemeWidth, { label: string; css: string }> = {
  narrow: { label: "Narrow (good for link pages)", css: "34rem" },
  medium: { label: "Medium", css: "46rem" },
  wide: { label: "Wide", css: "64rem" },
};

export const DEFAULT_THEME: ThemeTokens = findTheme(DEFAULT_THEME_ID)!.tokens;

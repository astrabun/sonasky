/** Font families Apollo knows how to render (system fonts only - no web fonts). */
export type ThemeFont = "sans" | "serif" | "mono" | "rounded";
export type ThemeRadius = "none" | "small" | "medium" | "large";
export type ThemeWidth = "narrow" | "medium" | "wide";

export const THEME_FONT_VALUES: readonly ThemeFont[] = ["sans", "serif", "mono", "rounded"];
export const THEME_RADIUS_VALUES: readonly ThemeRadius[] = ["none", "small", "medium", "large"];
export const THEME_WIDTH_VALUES: readonly ThemeWidth[] = ["narrow", "medium", "wide"];

/** A site's visual theme. All colors are `#rrggbb`. */
export interface ThemeTokens {
  /** Page background. */
  background: string;
  /** Cards and boxes (Bluesky embeds, events, code blocks). */
  surface: string;
  /** Main text. */
  text: string;
  /** Softer text: captions, dates, menu links. */
  muted: string;
  /** Button background. */
  accent: string;
  /** Text on buttons. */
  accentText: string;
  /** Link color. Falls back to `accent` when unset. */
  link?: string;
  /** Built-in font, and the fallback while (or if) a Google font loads. */
  fontBody: ThemeFont;
  fontHeading: ThemeFont;
  /**
   * Optional Google Fonts families (e.g. "Atkinson Hyperlegible"), shown in
   * front of the built-in fonts.
   */
  googleFonts?: { body?: string; heading?: string };
  radius: ThemeRadius;
  width: ThemeWidth;
}

export interface ThemeAuthor {
  /** How the author wants to be credited. */
  name: string;
  /** Bluesky handle, without the @. */
  handle?: string;
}

export interface ThemeDefinition {
  /** Unique, permanent id: lowercase letters, numbers and dashes. */
  id: string;
  /** Shown in the theme picker. */
  name: string;
  /** One short sentence. */
  description?: string;
  author: ThemeAuthor;
  /** Where the colors come from, if they're based on something else (with its license). */
  source?: string;
  tokens: ThemeTokens;
}

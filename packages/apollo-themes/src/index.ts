import { paper } from "./community/paper.ts";
import { midnight } from "./official/midnight.ts";
import { skyDark, skyDim, skyLight } from "./official/sky.ts";
import { terminal } from "./official/terminal.ts";
import type { ThemeDefinition } from "./types.ts";

export * from "./types.ts";
export * from "./validate.ts";
export * from "./export.ts";

/** Themes maintained by SonaSky, shown first in the picker. */
export const OFFICIAL_THEMES: readonly ThemeDefinition[] = [
  skyLight,
  skyDim,
  skyDark,
  midnight,
  terminal,
];

/**
 * Themes contributed by the community. To add one, see README.md: add a file
 * in src/community/ and list it here (alphabetical by id).
 */
export const COMMUNITY_THEMES: readonly ThemeDefinition[] = [paper];

export const ALL_THEMES: readonly ThemeDefinition[] = [...OFFICIAL_THEMES, ...COMMUNITY_THEMES];

/** The theme new sites start with. */
export const DEFAULT_THEME_ID = "sky-light";

export function findTheme(id: string | undefined): ThemeDefinition | undefined {
  return id ? ALL_THEMES.find((t) => t.id === id) : undefined;
}

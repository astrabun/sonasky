import type { BrowsableLabel } from "@sonasky/labels-def";

/** app.bsky.feed.generator.displayName caps at 24 graphemes. */
export const MAX_DISPLAY_NAME_GRAPHEMES = 24;

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export const truncateGraphemes = (str: string, max = MAX_DISPLAY_NAME_GRAPHEMES): string => {
  const graphemes = [...segmenter.segment(str)];
  if (graphemes.length <= max) return str;
  return graphemes
    .slice(0, max)
    .map((g) => g.segment)
    .join("")
    .trimEnd();
};

export const englishName = (label: Pick<BrowsableLabel, "locales">): string =>
  (label.locales.find((l) => l.lang === "en") ?? label.locales[0])?.name ?? "";

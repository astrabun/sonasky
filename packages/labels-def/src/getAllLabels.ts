import { isActiveLabel } from "./isActiveLabel.ts";
import { labels } from "./labels.ts";
import type { LabelDef, LabelLocale } from "./types.ts";

export interface BrowsableLabel extends LabelDef {
  id: string;
}

export interface BrowsableLabelLocalesObject extends Omit<LabelDef, "locales"> {
  id: string;
  locales: Record<string, LabelLocale>;
}

export function getAllLabels(options?: { localesToObject?: false }): BrowsableLabel[];
export function getAllLabels(options: { localesToObject: true }): BrowsableLabelLocalesObject[];
export function getAllLabels(options?: {
  localesToObject?: boolean;
}): BrowsableLabel[] | BrowsableLabelLocalesObject[] {
  const all = Object.entries(labels)
    .filter(([, def]) => isActiveLabel(def))
    .map(([id, def]) => ({ id, ...def }));

  if (!options?.localesToObject) {
    return all;
  }

  return all.map(({ locales, ...rest }) => ({
    ...rest,
    locales: Object.fromEntries(locales.map((locale) => [locale.lang, locale])),
  }));
}

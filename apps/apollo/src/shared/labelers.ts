import { SONASKY_DID, SONASKY_POKEMON_DID } from "@sonasky/labels-def";
import { LIMITS } from "./limits.ts";
import type { LabelsLayout } from "./records.ts";

/** Labelers offered as one-click choices in the labels block / snippet. */
export const PRESET_LABELERS = [
  { did: SONASKY_DID, alias: "sonasky", name: "SonaSky" },
  { did: SONASKY_POKEMON_DID, alias: "pokemon", name: "SonaSky Pokémon" },
] as const;

/** SonaSky labels have a page on sonasky.app; other labelers' don't. */
export function sonaskyLabelUrl(labelerDid: string, val: string): string | null {
  return PRESET_LABELERS.some((p) => p.did === labelerDid)
    ? `https://sonasky.app/?id=${encodeURIComponent(val)}`
    : null;
}

const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+(%3A[0-9]+)?)$/;

/**
 * Placeholder that embeds the labels widget in writing / HTML pages:
 * `<div data-apollo-labels="sonasky pokemon did:plc:..." data-layout="combined"></div>`.
 */
export const LABELS_PLACEHOLDER_ATTR = "data-apollo-labels";

/** Parse `data-apollo-labels`: whitespace-separated aliases or DIDs. Junk is dropped. */
export function parseLabelerList(value: string): string[] {
  const out: string[] = [];
  for (const token of value.trim().split(/[\s,]+/)) {
    const preset = PRESET_LABELERS.find((p) => p.alias === token.toLowerCase());
    const did = preset ? preset.did : DID_RE.test(token) ? token : null;
    if (did && !out.includes(did)) out.push(did);
  }
  return out.slice(0, LIMITS.labelersPerBlock);
}

/** The placeholder snippet the editor inserts into writing / HTML pages. */
export function labelsPlaceholder(opts: {
  labelers: string[];
  layout?: LabelsLayout;
  title?: string;
}): string {
  const list = opts.labelers
    .map((did) => PRESET_LABELERS.find((p) => p.did === did)?.alias ?? did)
    .join(" ");
  const attrEsc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<div ${LABELS_PLACEHOLDER_ATTR}="${list}"${
    opts.layout === "combined" ? ` data-layout="combined"` : ""
  }${opts.title ? ` data-title="${attrEsc(opts.title)}"` : ""}></div>`;
}

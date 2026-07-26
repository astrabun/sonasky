export interface LabelLocale {
  /** Use language code from https://github.com/bluesky-social/social-app/blob/main/src/locale/languages.ts#L7C1-L25C2 */
  lang: string;
  /** The label display name in this locale. */
  name: string;
  /** The label description in this locale. */
  description: string;
}

export interface LabelDef {
  /** Not every label has an associated post (e.g. sonasky-ref-sheet-user). MOST SHOULD HAVE ONE THOUGH! */
  post?: string;
  /** What labeler is this label associated with? */
  realm: string;
  /** Is this part of a particular category? (used only for browse site) */
  category?: Record<string, string>;
  /** Flags determine if a label should be removed from deployment. */
  flags?: string[];
  /** Define how a label shows up in multiple languages. */
  locales: LabelLocale[];
}

export type LabelDefs = Record<string, LabelDef>;

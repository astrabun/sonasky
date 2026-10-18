/** Fields every kind of field shares. */
interface FieldBase {
  /** Shown above the input in Apollo's editor. */
  label: string;
  /** One short hint under the input. */
  help?: string;
}

/** A single line of text. `max` is in UTF-8 bytes (default 300). */
export interface TextField extends FieldBase {
  type: "text";
  required?: boolean;
  max?: number;
  placeholder?: string;
}

/** A few lines of plain text (no formatting). `max` defaults to 3000 bytes. */
export interface LongTextField extends FieldBase {
  type: "longText";
  required?: boolean;
  max?: number;
  rows?: number;
  placeholder?: string;
}

/** Formatted text, edited like a Text block. `max` defaults to 8192 bytes. */
export interface MarkdownField extends FieldBase {
  type: "markdown";
  required?: boolean;
  max?: number;
}

/** A link. Apollo checks it with the same rules as Link buttons. */
export interface UrlField extends FieldBase {
  type: "url";
  required?: boolean;
}

/** A date and time, stored as an ISO string. */
export interface DatetimeField extends FieldBase {
  type: "datetime";
  required?: boolean;
}

/** A dropdown. Always has a value: `default` until someone picks another. */
export interface SelectField extends FieldBase {
  type: "select";
  options: readonly { value: string; label: string }[];
  default: string;
}

/** A number. Always has a value: `default` until someone types another. */
export interface NumberField extends FieldBase {
  type: "number";
  default: number;
  min?: number;
  max?: number;
}

/** A checkbox. Unchecked unless `default` is true. */
export interface BooleanField extends FieldBase {
  type: "boolean";
  default?: boolean;
}

/** An uploaded picture, with its description (alt text). */
export interface MediaField extends FieldBase {
  type: "media";
  required?: boolean;
}

/**
 * Several uploaded pictures, each with its description. Always a list in
 * `render` (empty when there are none). `max` defaults to 24.
 */
export interface MediaListField extends FieldBase {
  type: "mediaList";
  required?: boolean;
  max?: number;
}

export type FieldDef =
  | TextField
  | LongTextField
  | MarkdownField
  | UrlField
  | DatetimeField
  | SelectField
  | NumberField
  | BooleanField
  | MediaField
  | MediaListField;

export type FieldType = FieldDef["type"];

export type Fields = Record<string, FieldDef>;

/** A picture field's value. `alt` is required unless `noAlt` is true. */
export interface MediaValue {
  /** Media record rkey. */
  media: string;
  alt: string;
  /** Uploaded with an explicit "no description" choice. */
  noAlt?: true;
}

export type FieldValue = string | number | boolean | MediaValue | MediaValue[];

type ValueOf<F extends FieldDef> = F extends NumberField
  ? number
  : F extends BooleanField
    ? boolean
    : F extends MediaField
      ? MediaValue
      : F extends MediaListField
        ? MediaValue[]
        : string;

/** Fields that always have a value after validation. */
type AlwaysSet<F extends FieldDef> = F extends
  | SelectField
  | NumberField
  | BooleanField
  | MediaListField
  ? true
  : F extends { required: true }
    ? true
    : false;

/** The checked values `render` receives, typed from the block's `fields`. */
export type FieldValues<F extends Fields> = {
  [K in keyof F]: AlwaysSet<F[K]> extends true ? ValueOf<F[K]> : ValueOf<F[K]> | undefined;
};

/** What a block's `render` may use. Apollo supplies these when it renders a page. */
export interface RenderHelpers {
  /** Escape text for HTML (text and quoted attributes). Use it for everything people typed. */
  esc(value: string | number | undefined | null): string;
  /** A markdown field, already turned into safe HTML ("" when empty). */
  html(key: string): string;
  /** A link that's safe to put in `href`, or null to leave the link out. */
  href(url: string | undefined): string | null;
  /** The address of an uploaded picture, or null if it isn't one. */
  mediaUrl(rkey: string | undefined): string | null;
  /** "Saturday, October 24, 2026 at 7:00 PM EDT", or null for a bad date. */
  formatDate(iso: string | undefined, timezone?: string): string | null;
}

export interface BlockAuthor {
  /** How the author wants to be credited. */
  name: string;
  /** Bluesky handle, without the @. */
  handle?: string;
}

export interface CommunityBlockDefinition<F extends Fields = Fields> {
  /** Unique, permanent id: lowercase letters, numbers and dashes. */
  id: string;
  /** Shown in Apollo's "Add a block" menu. */
  name: string;
  /** One short sentence. */
  description: string;
  author: BlockAuthor;
  /** Where the idea or code comes from, if it's based on something else (with its license). */
  source?: string;
  /** The form Apollo shows for this block, in order. Keys are permanent. */
  fields: F;
  /** What a new block starts with in the editor. Must pass the block's own checks. */
  example: Partial<Record<keyof F, unknown>>;
  /**
   * Optional styles. Apollo wraps them in `.apollo-cb-<id> { ... }`, so write
   * `.title { ... }` for things inside the block and `& { ... }` for the block itself.
   */
  css?: string;
  /**
   * Optional JavaScript that makes the block interactive. It runs once for
   * each of this block on the page, with `block` set to that block's wrapper
   * element. The block must still work without it (Apollo's editor preview
   * doesn't run scripts). See the README for what scripts may do.
   */
  script?: string;
  /**
   * The block's HTML. The same values must always give the same HTML: use only
   * `fields` and `h` (no fetching, current time, randomness or saved state).
   * Apollo sanitizes the result (scripts, iframes and event
   * handlers are removed) and wraps it in `<div class="apollo-cb apollo-cb-<id>">`.
   */
  render(fields: FieldValues<F>, h: RenderHelpers): string;
}

/**
 * Write a community block with its field values typed from `fields`. Returns
 * the definition unchanged.
 */
export function defineCommunityBlock<const F extends Fields>(
  def: CommunityBlockDefinition<F>,
): CommunityBlockDefinition<F> {
  return def;
}

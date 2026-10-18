import type { CommunityBlockDefinition, FieldDef, FieldValue, MediaValue } from "./types.ts";

/** Default byte caps for text fields, matching Apollo's built-in blocks. */
export const FIELD_MAX_BYTES = { text: 300, longText: 3000, markdown: 8192, url: 2048 } as const;
export const MAX_DATETIME_LENGTH = 64;
export const MAX_ALT_BYTES = 2000;
/** Pictures in one `mediaList` field, matching the built-in Gallery block. */
export const MAX_MEDIA_LIST = 24;

export interface FieldError {
  /** Field key, e.g. "quote" or "photo.alt". */
  path: string;
  message: string;
}

export type NormalizeResult =
  | { ok: true; fields: Record<string, FieldValue> }
  | { ok: false; errors: FieldError[] };

/** UTF-8 length of a string (what Lexicon `maxLength` counts). */
export function utf8Bytes(value: string): number {
  let n = 0;
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function empty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * One field's value, checked and tidied. Returns `undefined` for an empty
 * optional field, or an error message.
 */
function normalizeField(
  def: FieldDef,
  value: unknown,
): { value?: FieldValue; error?: string; path?: string } {
  switch (def.type) {
    case "text":
    case "longText":
    case "markdown":
    case "url": {
      if (empty(value)) return def.required ? { error: "This is required." } : {};
      if (typeof value !== "string") return { error: "Expected text." };
      const max = def.type === "url" ? FIELD_MAX_BYTES.url : (def.max ?? FIELD_MAX_BYTES[def.type]);
      if (utf8Bytes(value) > max) return { error: `Too long (max ${max} bytes).` };
      return { value: def.type === "url" ? value.trim() : value };
    }
    case "datetime": {
      if (empty(value)) return def.required ? { error: "Pick a date and time." } : {};
      if (
        typeof value !== "string" ||
        value.length > MAX_DATETIME_LENGTH ||
        Number.isNaN(Date.parse(value))
      ) {
        return { error: "Not a valid date/time." };
      }
      return { value: new Date(value).toISOString() };
    }
    case "select": {
      if (empty(value)) return { value: def.default };
      if (typeof value !== "string" || !def.options.some((o) => o.value === value)) {
        return { error: `Must be one of: ${def.options.map((o) => o.value).join(", ")}.` };
      }
      return { value };
    }
    case "number": {
      if (empty(value)) return { value: def.default };
      if (typeof value !== "number" || !Number.isFinite(value))
        return { error: "Expected a number." };
      if (def.min !== undefined && value < def.min)
        return { error: `Must be at least ${def.min}.` };
      if (def.max !== undefined && value > def.max) return { error: `Must be at most ${def.max}.` };
      return { value };
    }
    case "boolean": {
      if (empty(value)) return { value: def.default ?? false };
      if (typeof value !== "boolean") return { error: "Expected yes or no." };
      return { value };
    }
    case "media": {
      if (empty(value) || (isObject(value) && empty(value.media))) {
        return def.required ? { error: "Pick an uploaded image." } : {};
      }
      return normalizeMedia(value);
    }
    case "mediaList": {
      if (empty(value) || (Array.isArray(value) && value.length === 0)) {
        return def.required ? { error: "Add at least one picture." } : { value: [] };
      }
      if (!Array.isArray(value)) return { error: "Expected a list of pictures." };
      const max = def.max ?? MAX_MEDIA_LIST;
      if (value.length > max) return { error: `Too many pictures (max ${max}).` };
      const items: MediaValue[] = [];
      for (const [i, item] of value.entries()) {
        const result = normalizeMedia(item);
        if (result.error) {
          return { error: result.error, path: result.path ? `${i}.${result.path}` : `${i}` };
        }
        items.push(result.value as MediaValue);
      }
      return { value: items };
    }
  }
}

/** One picture: an rkey plus a description, unless it was uploaded as "no description". */
function normalizeMedia(value: unknown): { value?: MediaValue; error?: string; path?: string } {
  if (!isObject(value) || typeof value.media !== "string" || !value.media) {
    return { error: "Pick an uploaded image." };
  }
  const alt = value.alt;
  if (alt !== undefined && typeof alt !== "string") {
    return { error: "Expected text.", path: "alt" };
  }
  if (alt && utf8Bytes(alt) > MAX_ALT_BYTES) {
    return { error: `Too long (max ${MAX_ALT_BYTES} bytes).`, path: "alt" };
  }
  if (alt) return { value: { media: value.media, alt } };
  if (value.noAlt === true) return { value: { media: value.media, alt: "", noAlt: true } };
  return { error: "Add a description of the picture.", path: "alt" };
}

/**
 * Check a block's field values against its definition. Unknown keys are
 * dropped, empty optional fields are left out, and select / number / boolean
 * fields get their defaults. Apollo's editor and server both use this, so the
 * error messages are written for people filling in the form.
 */
export function normalizeFields(def: CommunityBlockDefinition, input: unknown): NormalizeResult {
  if (!isObject(input)) {
    return { ok: false, errors: [{ path: "", message: "Expected an object." }] };
  }
  const fields: Record<string, FieldValue> = {};
  const errors: FieldError[] = [];
  for (const [key, field] of Object.entries(def.fields)) {
    const result = normalizeField(field, input[key]);
    if (result.error) {
      errors.push({ path: result.path ? `${key}.${result.path}` : key, message: result.error });
    } else if (result.value !== undefined) {
      fields[key] = result.value;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, fields };
}

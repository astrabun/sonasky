import { cssProblems } from "./css.ts";
import { normalizeFields } from "./fields.ts";
import type { CommunityBlockDefinition, FieldValues, Fields, RenderHelpers } from "./types.ts";

export const BLOCK_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const FIELD_KEY_RE = /^[a-z][a-zA-Z0-9]{0,31}$/;
export const MAX_FIELDS = 12;
const HANDLE_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/i;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Stand-ins for Apollo's render helpers, for checking a block renders at all. */
export function testHelpers(): RenderHelpers {
  return {
    esc: (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]),
    html: () => "<p>…</p>",
    href: (url) => url ?? null,
    mediaUrl: (rkey) => (rkey ? `https://example.com/m/${rkey}` : null),
    formatDate: (iso) => (iso ? iso : null),
  };
}

/**
 * Everything wrong with a block definition, as human-readable messages. An
 * empty list means it's valid. Run by `pnpm -F @sonasky/apollo-blocks test`
 * for every block in this package.
 */
export function validateBlockDefinition(def: CommunityBlockDefinition): string[] {
  const errors: string[] = [];
  const where = `block "${def.id}"`;

  if (!BLOCK_ID_RE.test(def.id)) {
    errors.push(`${where}: id must be lowercase letters, numbers and dashes (max 64)`);
  }
  if (!def.name?.trim() || def.name.length > 40) {
    errors.push(`${where}: name must be 1-40 characters`);
  }
  if (!def.description?.trim() || def.description.length > 140) {
    errors.push(`${where}: description must be 1-140 characters`);
  }
  if (!def.author?.name?.trim()) errors.push(`${where}: author.name is required`);
  if (def.author?.handle && !HANDLE_RE.test(def.author.handle)) {
    errors.push(`${where}: author.handle must be a Bluesky handle without the @`);
  }
  if (typeof def.render !== "function") errors.push(`${where}: render must be a function`);

  const entries = Object.entries(def.fields ?? {});
  if (entries.length < 1 || entries.length > MAX_FIELDS) {
    errors.push(`${where}: must have 1-${MAX_FIELDS} fields`);
  }
  for (const [key, field] of entries) {
    if (!FIELD_KEY_RE.test(key)) {
      errors.push(`${where}: field "${key}" must be a camelCase name like "title" (max 32)`);
    }
    if (!field.label?.trim()) errors.push(`${where}: field "${key}" needs a label`);
    if (field.type === "select") {
      if (!field.options.length) errors.push(`${where}: field "${key}" needs options`);
      if (!field.options.some((o) => o.value === field.default)) {
        errors.push(`${where}: field "${key}" default must be one of its options`);
      }
    }
    if (
      field.type === "number" &&
      ((field.min !== undefined && field.default < field.min) ||
        (field.max !== undefined && field.default > field.max))
    ) {
      errors.push(`${where}: field "${key}" default must be between min and max`);
    }
  }
  for (const key of Object.keys(def.example ?? {})) {
    if (!(key in (def.fields ?? {}))) {
      errors.push(`${where}: example has "${key}", which isn't one of the fields`);
    }
  }

  const example = normalizeFields(def, def.example ?? {});
  if (!example.ok) {
    for (const e of example.errors) errors.push(`${where}: example.${e.path}: ${e.message}`);
  } else if (typeof def.render === "function") {
    try {
      const html = def.render(example.fields as FieldValues<Fields>, testHelpers());
      if (typeof html !== "string") errors.push(`${where}: render must return a string`);
    } catch (err) {
      errors.push(`${where}: render threw with the example values: ${String(err)}`);
    }
  }

  if (def.css !== undefined) {
    for (const problem of cssProblems(def.css)) errors.push(`${where}: ${problem}`);
  }
  return errors;
}

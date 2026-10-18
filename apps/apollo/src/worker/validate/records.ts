/**
 * Write-path validation. Every record Apollo puts in a PDS is rebuilt here from
 * known fields only (unknown keys are dropped), with byte caps from
 * `shared/limits.ts` and a whole-record size cap. Records are then written
 * with `validate: false` (the PDS doesn't know our lexicons) - this is the
 * validation.
 */

import { findCommunityBlock, normalizeFields, type MediaValue } from "@sonasky/apollo-blocks";
import { isGoogleFontFamily } from "@sonasky/apollo-themes";
import { COMMUNITY_UPGRADES } from "../../shared/communityUpgrades.ts";
import { jsonBytes, LIMITS, utf8Bytes } from "../../shared/limits.ts";
import { linkValueError } from "../../shared/links.ts";
import {
  NSID_LAYOUT,
  NSID_PAGE,
  NSID_POST,
  NSID_RING,
  NSID_RING_MEMBER,
  NSID_SCRIPT,
  NSID_SITE,
  NSID_STYLE,
  type SlugCollection,
} from "../../shared/nsid.ts";
import {
  SELF_LABEL_OPTIONS,
  type Block,
  type CommunityBlock,
  type LayoutRecord,
  type NavItem,
  type PageFormat,
  type PageRecord,
  type PostRecord,
  type RingMemberRecord,
  type RingRecord,
  type ScriptRecord,
  type SelfLabels,
  type SiteRecord,
  type StyleRecord,
  type ThemeTokens,
} from "../../shared/records.ts";
import { isSlug } from "../../shared/slug.ts";
import {
  HEX_COLOR_RE,
  THEME_FONTS,
  THEME_ID_RE,
  THEME_RADII,
  THEME_WIDTHS,
} from "../../shared/themes.ts";

export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

type Obj = Record<string, unknown>;

const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+(%3A[0-9]+)?)$/;
const AT_URI_RE =
  /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/([a-zA-Z0-9.]+)\/([a-zA-Z0-9._~:-]{1,512})$/;
const MEDIA_RKEY_RE = /^[a-zA-Z0-9._~:-]{1,512}$/;
const LANG_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
const TIMEZONE_RE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;

function obj(value: unknown, field: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(field, "Expected an object.");
  }
  return value as Obj;
}

function str(o: Obj, key: string, field: string, maxBytes: number, required: true): string;
function str(
  o: Obj,
  key: string,
  field: string,
  maxBytes: number,
  required?: false,
): string | undefined;
function str(
  o: Obj,
  key: string,
  field: string,
  maxBytes: number,
  required = false,
): string | undefined {
  const v = o[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ValidationError(field, "This is required.");
    return undefined;
  }
  if (typeof v !== "string") throw new ValidationError(field, "Expected text.");
  if (utf8Bytes(v) > maxBytes)
    throw new ValidationError(field, `Too long (max ${maxBytes} bytes).`);
  return v;
}

function oneOf<T extends string>(
  o: Obj,
  key: string,
  field: string,
  values: readonly T[],
  fallback?: T,
): T {
  const v = o[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "string" || !values.includes(v as T)) {
    throw new ValidationError(field, `Must be one of: ${values.join(", ")}.`);
  }
  return v as T;
}

function arr(o: Obj, key: string, field: string, max: number): unknown[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ValidationError(field, "Expected a list.");
  if (v.length > max) throw new ValidationError(field, `Too many items (max ${max}).`);
  return v;
}

function slugRef(o: Obj, key: string, field: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (!isSlug(v)) throw new ValidationError(field, "Not a valid page/style name.");
  return v;
}

function mediaRef(value: unknown, field: string): string {
  if (typeof value !== "string" || !MEDIA_RKEY_RE.test(value)) {
    throw new ValidationError(field, "Pick an uploaded image.");
  }
  return value;
}

function optMediaRef(o: Obj, key: string, field: string): string | undefined {
  const v = o[key];
  return v === undefined || v === null || v === "" ? undefined : mediaRef(v, field);
}

function link(value: unknown, field: string): string {
  if (typeof value !== "string") throw new ValidationError(field, "Add a link.");
  if (utf8Bytes(value) > LIMITS.urlBytes) throw new ValidationError(field, "Link is too long.");
  const err = linkValueError(value);
  if (err) throw new ValidationError(field, err);
  return value.trim();
}

function datetime(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(field, "Pick a date and time.");
    return undefined;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || value.length > 64) {
    throw new ValidationError(field, "Not a valid date/time.");
  }
  return new Date(value).toISOString();
}

function selfLabels(o: Obj, field: string): SelfLabels | undefined {
  const v = o.labels;
  if (v === undefined || v === null) return undefined;
  const labels = obj(v, field);
  const allowed = new Set<string>(SELF_LABEL_OPTIONS.map((l) => l.val));
  const values = arr(labels, "values", field, 8).map((item, i) => {
    const val = obj(item, `${field}.values[${i}]`).val;
    if (typeof val !== "string" || !allowed.has(val)) {
      throw new ValidationError(field, "Unknown content warning.");
    }
    return { val };
  });
  return values.length ? { $type: "com.atproto.label.defs#selfLabels", values } : undefined;
}

/** Keep the original createdAt if it's a valid timestamp; always stamp updatedAt. */
function timestamps(o: Obj): { createdAt: string; updatedAt: string } {
  const now = new Date().toISOString();
  const created =
    typeof o.createdAt === "string" && !Number.isNaN(Date.parse(o.createdAt))
      ? new Date(o.createdAt).toISOString()
      : now;
  return { createdAt: created, updatedAt: now };
}

function checkSize(record: unknown): void {
  const bytes = jsonBytes(record);
  if (bytes > LIMITS.recordJsonBytes) {
    throw new ValidationError(
      "record",
      `This is too big to save (${Math.ceil(bytes / 1024)} KB, max ${Math.floor(LIMITS.recordJsonBytes / 1024)} KB). Try splitting it into more pages.`,
    );
  }
}

export function validateSite(input: unknown): SiteRecord {
  const o = obj(input, "site");
  const nav = arr(o, "nav", "nav", LIMITS.navItems).map((item, i): NavItem => {
    const n = obj(item, `nav[${i}]`);
    const label = str(n, "label", `nav[${i}].label`, LIMITS.labelBytes, true);
    const page = slugRef(n, "page", `nav[${i}].page`);
    if (page !== undefined) return { label, page };
    return { label, url: link(n.url, `nav[${i}].url`) };
  });
  const og = o.og === undefined || o.og === null ? undefined : obj(o.og, "og");
  const lang = str(o, "lang", "lang", 35);
  if (lang && !LANG_RE.test(lang)) throw new ValidationError("lang", "Not a valid language code.");
  const homePage = slugRef(o, "homePage", "homePage");
  if (!homePage) throw new ValidationError("homePage", "Pick a home page.");

  const record: SiteRecord = {
    $type: NSID_SITE,
    title: str(o, "title", "title", LIMITS.titleBytes, true),
    description: str(o, "description", "description", LIMITS.descriptionBytes),
    homePage,
    nav: nav.length ? nav : undefined,
    theme: slugRef(o, "theme", "theme"),
    defaultLayout: slugRef(o, "defaultLayout", "defaultLayout"),
    favicon: optMediaRef(o, "favicon", "favicon"),
    ogImage: optMediaRef(o, "ogImage", "ogImage"),
    og: og
      ? {
          title: str(og, "title", "og.title", LIMITS.titleBytes),
          description: str(og, "description", "og.description", LIMITS.descriptionBytes),
        }
      : undefined,
    lang,
    blogEnabled: o.blogEnabled === true ? true : undefined,
    labels: selfLabels(o, "labels"),
    ...timestamps(o),
  };
  checkSize(record);
  return record;
}

/**
 * Alt text is required unless the picture was uploaded with an explicit "no
 * description" choice (`noAlt: true`). A description, when given, always wins.
 */
function altFields(o: Obj, field: string): { alt: string; noAlt?: true } {
  const alt = str(o, "alt", `${field}.alt`, LIMITS.altBytes);
  if (alt) return { alt };
  if (o.noAlt === true) return { alt: "", noAlt: true };
  throw new ValidationError(`${field}.alt`, "Add a description of the picture.");
}

/**
 * A block from @sonasky/apollo-blocks: its fields are checked against the
 * block's definition there, then links and pictures get the same checks as
 * the built-in blocks.
 */
function validateCommunityBlock(id: string, input: unknown, field: string): CommunityBlock {
  const def = findCommunityBlock(id);
  if (!def) throw new ValidationError(`${field}.block`, "Unknown community block.");
  const result = normalizeFields(def, input ?? {});
  if (!result.ok) {
    const [e] = result.errors;
    throw new ValidationError(e.path ? `${field}.fields.${e.path}` : `${field}.fields`, e.message);
  }
  const fields = result.fields;
  for (const [key, f] of Object.entries(def.fields)) {
    const value = fields[key];
    if (value === undefined) continue;
    if (f.type === "url") fields[key] = link(value, `${field}.fields.${key}`);
    if (f.type === "media") mediaRef((value as MediaValue).media, `${field}.fields.${key}`);
    if (f.type === "mediaList") {
      (value as MediaValue[]).forEach((item, i) =>
        mediaRef(item.media, `${field}.fields.${key}.${i}`),
      );
    }
  }
  if (jsonBytes(fields) > LIMITS.communityBlockBytes) {
    throw new ValidationError(`${field}.fields`, "This block has too much in it.");
  }
  return { $type: "app.sonasky.apollo.defs#community", block: id, fields };
}

function validateBlock(input: unknown, field: string): Block {
  const b = obj(input, field);
  switch (b.$type) {
    case "app.sonasky.apollo.defs#heading": {
      const level = b.level === 1 || b.level === 2 || b.level === 3 ? b.level : 2;
      return {
        $type: b.$type,
        text: str(b, "text", `${field}.text`, LIMITS.titleBytes, true),
        level,
      };
    }
    case "app.sonasky.apollo.defs#text":
      return {
        $type: b.$type,
        markdown: str(b, "markdown", `${field}.markdown`, LIMITS.textBlockBytes) ?? "",
      };
    case "app.sonasky.apollo.defs#image":
      return {
        $type: b.$type,
        media: mediaRef(b.media, `${field}.media`),
        ...altFields(b, field),
        caption: str(b, "caption", `${field}.caption`, LIMITS.descriptionBytes),
        size: oneOf(b, "size", `${field}.size`, ["small", "medium", "full"] as const, "full"),
      };
    case "app.sonasky.apollo.defs#buttons":
      return {
        $type: b.$type,
        items: arr(b, "items", `${field}.items`, LIMITS.buttonsPerBlock).map((item, i) => {
          const it = obj(item, `${field}.items[${i}]`);
          return {
            label: str(it, "label", `${field}.items[${i}].label`, LIMITS.labelBytes, true),
            url: link(it.url, `${field}.items[${i}].url`),
          };
        }),
      };
    case "app.sonasky.apollo.defs#gallery":
      return {
        $type: b.$type,
        items: arr(b, "items", `${field}.items`, LIMITS.galleryItems).map((item, i) => {
          const it = obj(item, `${field}.items[${i}]`);
          return {
            media: mediaRef(it.media, `${field}.items[${i}].media`),
            ...altFields(it, `${field}.items[${i}]`),
          };
        }),
      };
    case "app.sonasky.apollo.defs#bskyPost": {
      const m = typeof b.uri === "string" ? AT_URI_RE.exec(b.uri) : null;
      if (!m || m[2] !== "app.bsky.feed.post") {
        throw new ValidationError(`${field}.uri`, "Paste a link to a Bluesky post.");
      }
      return { $type: b.$type, uri: b.uri as string };
    }
    case "app.sonasky.apollo.defs#bskyProfile":
      if (typeof b.did !== "string" || !DID_RE.test(b.did)) {
        throw new ValidationError(`${field}.did`, "Paste a link to a Bluesky profile.");
      }
      return { $type: b.$type, did: b.did };
    case "app.sonasky.apollo.defs#starterPack": {
      const m = typeof b.uri === "string" ? AT_URI_RE.exec(b.uri) : null;
      if (!m || m[2] !== "app.bsky.graph.starterpack") {
        throw new ValidationError(`${field}.uri`, "Paste a link to a Bluesky starter pack.");
      }
      return { $type: b.$type, uri: b.uri as string };
    }
    case "app.sonasky.apollo.defs#event": {
      const timezone = str(b, "timezone", `${field}.timezone`, 64);
      if (timezone && !TIMEZONE_RE.test(timezone)) {
        throw new ValidationError(`${field}.timezone`, "Not a valid time zone.");
      }
      return {
        $type: b.$type,
        name: str(b, "name", `${field}.name`, LIMITS.titleBytes, true),
        start: datetime(b.start, `${field}.start`, true) as string,
        end: datetime(b.end, `${field}.end`, false),
        timezone,
        location: str(b, "location", `${field}.location`, LIMITS.titleBytes),
        url: b.url === undefined || b.url === "" ? undefined : link(b.url, `${field}.url`),
      };
    }
    case "app.sonasky.apollo.defs#labels": {
      const labelers = arr(b, "labelers", `${field}.labelers`, LIMITS.labelersPerBlock).map(
        (did, i) => {
          if (typeof did !== "string" || !DID_RE.test(did)) {
            throw new ValidationError(`${field}.labelers[${i}]`, "Not a valid labeler.");
          }
          return did;
        },
      );
      return {
        $type: b.$type,
        labelers: [...new Set(labelers)],
        layout: oneOf(b, "layout", `${field}.layout`, ["grouped", "combined"] as const, "grouped"),
        title: str(b, "title", `${field}.title`, LIMITS.titleBytes),
      };
    }
    case "app.sonasky.apollo.defs#divider":
      return { $type: b.$type };
    case "app.sonasky.apollo.defs#spacer":
      return {
        $type: b.$type,
        size: oneOf(b, "size", `${field}.size`, ["small", "medium", "large"] as const, "medium"),
      };
    case "app.sonasky.apollo.defs#community": {
      const id = str(b, "block", `${field}.block`, 64, true);
      const upgrade = COMMUNITY_UPGRADES[id];
      if (upgrade) return validateBlock(upgrade(obj(b.fields ?? {}, `${field}.fields`)), field);
      return validateCommunityBlock(id, b.fields, field);
    }
    default:
      throw new ValidationError(field, "Unknown block type.");
  }
}

function contentFields(o: Obj) {
  const format = oneOf<PageFormat>(o, "format", "format", ["blocks", "markdown", "html"]);
  const blocks =
    format === "blocks"
      ? arr(o, "blocks", "blocks", LIMITS.blocksPerPage).map((b, i) =>
          validateBlock(b, `blocks[${i}]`),
        )
      : undefined;
  const body =
    format === "blocks" ? undefined : (str(o, "body", "body", LIMITS.pageBodyBytes) ?? "");
  const refs = (key: "styles" | "scripts", max: number) => {
    const list = arr(o, key, key, max).map((v, i) => {
      if (!isSlug(v)) throw new ValidationError(`${key}[${i}]`, "Not a valid name.");
      return v;
    });
    return list.length ? [...new Set(list)] : undefined;
  };
  return {
    title: str(o, "title", "title", LIMITS.titleBytes, true),
    description: str(o, "description", "description", LIMITS.descriptionBytes),
    format,
    blocks,
    body,
    layout: slugRef(o, "layout", "layout"),
    styles: refs("styles", LIMITS.stylesPerPage),
    scripts: refs("scripts", LIMITS.scriptsPerPage),
    ogImage: optMediaRef(o, "ogImage", "ogImage"),
    labels: selfLabels(o, "labels"),
    ...timestamps(o),
  };
}

export function validatePage(input: unknown): PageRecord {
  const record: PageRecord = { $type: NSID_PAGE, ...contentFields(obj(input, "page")) };
  checkSize(record);
  return record;
}

export function validatePost(input: unknown): PostRecord {
  const o = obj(input, "post");
  const tags = arr(o, "tags", "tags", LIMITS.tagsPerPost).map((t, i) => {
    if (typeof t !== "string" || !t.trim() || utf8Bytes(t) > 64) {
      throw new ValidationError(`tags[${i}]`, "Tags must be short text.");
    }
    return t.trim();
  });
  const record: PostRecord = {
    $type: NSID_POST,
    ...contentFields(o),
    publishedAt: datetime(o.publishedAt, "publishedAt", false) ?? new Date().toISOString(),
    tags: tags.length ? tags : undefined,
  };
  checkSize(record);
  return record;
}

function validateTokens(input: unknown): ThemeTokens {
  const t = obj(input, "tokens");
  const color = (key: keyof ThemeTokens) => {
    const v = t[key];
    if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
      throw new ValidationError(`tokens.${key}`, "Pick a color.");
    }
    return v.toLowerCase();
  };
  const pick = <K extends string>(key: keyof ThemeTokens, table: Record<K, unknown>): K => {
    const v = t[key];
    if (typeof v !== "string" || !(v in table))
      throw new ValidationError(`tokens.${key}`, "Pick an option.");
    return v as K;
  };
  return {
    background: color("background"),
    surface: color("surface"),
    text: color("text"),
    muted: color("muted"),
    accent: color("accent"),
    accentText: color("accentText"),
    ...(t.link === undefined || t.link === null || t.link === "" ? {} : { link: color("link") }),
    fontBody: pick("fontBody", THEME_FONTS),
    fontHeading: pick("fontHeading", THEME_FONTS),
    ...googleFonts(t.googleFonts),
    radius: pick("radius", THEME_RADII),
    width: pick("width", THEME_WIDTHS),
  };
}

function googleFonts(value: unknown): { googleFonts?: ThemeTokens["googleFonts"] } {
  if (value === undefined || value === null) return {};
  const g = obj(value, "tokens.googleFonts");
  const out: NonNullable<ThemeTokens["googleFonts"]> = {};
  for (const slot of ["body", "heading"] as const) {
    const family = g[slot];
    if (family === undefined || family === null || family === "") continue;
    if (!isGoogleFontFamily(family)) {
      throw new ValidationError(
        `tokens.googleFonts.${slot}`,
        "Use the font's name exactly as Google Fonts shows it, like “Atkinson Hyperlegible”.",
      );
    }
    out[slot] = family;
  }
  return out.body || out.heading ? { googleFonts: out } : {};
}

/** A catalog theme id. Unknown ids are kept (newer catalog, or a removed theme) but must be well-formed. */
function themeIdRef(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !THEME_ID_RE.test(value)) {
    throw new ValidationError("basedOn", "Not a valid theme.");
  }
  return value;
}

export function validateStyle(input: unknown): StyleRecord {
  const o = obj(input, "style");
  const record: StyleRecord = {
    $type: NSID_STYLE,
    name: str(o, "name", "name", LIMITS.nameBytes, true),
    tokens: o.tokens === undefined || o.tokens === null ? undefined : validateTokens(o.tokens),
    basedOn: themeIdRef(o.basedOn),
    css: str(o, "css", "css", LIMITS.styleCssBytes),
    ...timestamps(o),
  };
  checkSize(record);
  return record;
}

export function validateScript(input: unknown): ScriptRecord {
  const o = obj(input, "script");
  const record: ScriptRecord = {
    $type: NSID_SCRIPT,
    name: str(o, "name", "name", LIMITS.nameBytes, true),
    js: str(o, "js", "js", LIMITS.scriptJsBytes) ?? "",
    ...timestamps(o),
  };
  checkSize(record);
  return record;
}

export function validateLayout(input: unknown): LayoutRecord {
  const o = obj(input, "layout");
  const html = str(o, "html", "html", LIMITS.layoutHtmlBytes, true);
  if (!/\{\{\s*content\s*\}\}/.test(html)) {
    throw new ValidationError("html", "A layout needs a {{content}} slot for the page.");
  }
  const record: LayoutRecord = {
    $type: NSID_LAYOUT,
    name: str(o, "name", "name", LIMITS.nameBytes, true),
    html,
    ...timestamps(o),
  };
  checkSize(record);
  return record;
}

export function validateRing(input: unknown): RingRecord {
  const o = obj(input, "ring");
  const format = oneOf(o, "format", "format", ["markdown", "html"] as const, "markdown");
  const seen = new Set<string>();
  const members = arr(o, "members", "members", LIMITS.ringMembers).map((item, i) => {
    const m = obj(item, `members[${i}]`);
    if (typeof m.did !== "string" || !DID_RE.test(m.did)) {
      throw new ValidationError(`members[${i}]`, "Not a valid account.");
    }
    if (seen.has(m.did)) throw new ValidationError(`members[${i}]`, "That site is already listed.");
    seen.add(m.did);
    return {
      did: m.did,
      addedAt: datetime(m.addedAt, `members[${i}].addedAt`, false) ?? new Date().toISOString(),
    };
  });
  const record: RingRecord = {
    $type: NSID_RING,
    name: str(o, "name", "name", LIMITS.titleBytes, true),
    description: str(o, "description", "description", LIMITS.descriptionBytes),
    format,
    body: str(o, "body", "body", LIMITS.pageBodyBytes),
    theme: slugRef(o, "theme", "theme"),
    members,
    ...(o.unlisted === true ? { unlisted: true } : {}),
    ...timestamps(o),
  };
  checkSize(record);
  return record;
}

/** `at://<did>/app.sonasky.apollo.ring/<slug>` -> its parts, or null. */
export function parseRingUri(value: unknown): { did: string; slug: string } | null {
  if (typeof value !== "string") return null;
  const m = AT_URI_RE.exec(value);
  if (!m || m[2] !== NSID_RING || !DID_RE.test(m[1]) || !isSlug(m[3])) return null;
  return { did: m[1], slug: m[3] };
}

export function validateRingMember(input: unknown): RingMemberRecord {
  const o = obj(input, "ringMember");
  if (!parseRingUri(o.ring)) throw new ValidationError("ring", "Not a valid ring.");
  return {
    $type: NSID_RING_MEMBER,
    ring: o.ring as string,
    createdAt: timestamps(o).createdAt,
  };
}

export const SLUG_VALIDATORS: Record<SlugCollection, (input: unknown) => unknown> = {
  [NSID_PAGE]: validatePage,
  [NSID_POST]: validatePost,
  [NSID_STYLE]: validateStyle,
  [NSID_SCRIPT]: validateScript,
  [NSID_LAYOUT]: validateLayout,
};

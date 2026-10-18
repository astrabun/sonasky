/**
 * Record shapes for the `app.sonasky.apollo.*` collections. These mirror the
 * documentation lexicons in `lexicons/`; records are written with
 * `validate: false` and checked by `src/worker/validate/records.ts` instead.
 *
 * References between records are bare rkeys in the SAME repo - a site can never
 * pull content from someone else's repo.
 */

import type { ThemeTokens } from "@sonasky/apollo-themes";
import type {
  NSID_LAYOUT,
  NSID_MEDIA,
  NSID_PAGE,
  NSID_POST,
  NSID_RING,
  NSID_RING_MEMBER,
  NSID_SCRIPT,
  NSID_SITE,
  NSID_STYLE,
} from "./nsid.ts";

/** `com.atproto.label.defs#selfLabels` - author-applied content warnings. */
export interface SelfLabels {
  $type: "com.atproto.label.defs#selfLabels";
  values: { val: string }[];
}

/** Self-label values the editor offers. All of them gate the page behind a warning. */
export const SELF_LABEL_OPTIONS = [
  { val: "sexual", label: "Suggestive or sexual content" },
  { val: "nudity", label: "Non-sexual nudity" },
  { val: "porn", label: "Adult content" },
  { val: "graphic-media", label: "Graphic or disturbing media" },
] as const;

/** JSON form of an atproto blob ref. */
export interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface NavItem {
  label: string;
  /** Page rkey in this site. Exactly one of `page` / `url` is set. */
  page?: string;
  url?: string;
}

export interface SiteRecord {
  $type: typeof NSID_SITE;
  title: string;
  description?: string;
  /** rkey of the page served at `/@actor`. */
  homePage: string;
  nav?: NavItem[];
  /** rkey of the site-wide style record (visual theme). */
  theme?: string;
  /** rkey of the default layout record; built-in layout when unset. */
  defaultLayout?: string;
  /** Media rkeys. */
  favicon?: string;
  ogImage?: string;
  og?: { title?: string; description?: string };
  lang?: string;
  /** When true, `/@actor/blog` lists this site's posts. */
  blogEnabled?: boolean;
  labels?: SelfLabels;
  createdAt: string;
  updatedAt: string;
}

export type PageFormat = "blocks" | "markdown" | "html";

// Blocks (`app.sonasky.apollo.defs#<name>`)

export interface HeadingBlock {
  $type: "app.sonasky.apollo.defs#heading";
  text: string;
  level: 1 | 2 | 3;
}

export interface TextBlock {
  $type: "app.sonasky.apollo.defs#text";
  /** Markdown. Raw HTML inside it is sanitized like everything else. */
  markdown: string;
}

export type ImageSize = "small" | "medium" | "full";

export interface ImageBlock {
  $type: "app.sonasky.apollo.defs#image";
  media: string;
  /** Required unless `noAlt` is set. */
  alt: string;
  /** The picture was uploaded with an explicit "no description" choice. */
  noAlt?: boolean;
  caption?: string;
  size?: ImageSize;
}

export interface ButtonsBlock {
  $type: "app.sonasky.apollo.defs#buttons";
  items: { label: string; url: string }[];
}

export interface GalleryItem {
  media: string;
  /** Required unless `noAlt` is set. */
  alt: string;
  /** The author explicitly chose not to describe this picture (alt is then ""). */
  noAlt?: boolean;
}

export interface GalleryBlock {
  $type: "app.sonasky.apollo.defs#gallery";
  items: GalleryItem[];
}

export interface BskyPostBlock {
  $type: "app.sonasky.apollo.defs#bskyPost";
  /** at:// uri of an app.bsky.feed.post. */
  uri: string;
}

export interface BskyProfileBlock {
  $type: "app.sonasky.apollo.defs#bskyProfile";
  /** DID of the profile. */
  did: string;
}

export interface StarterPackBlock {
  $type: "app.sonasky.apollo.defs#starterPack";
  /** at:// uri of an app.bsky.graph.starterpack. */
  uri: string;
}

export interface EventBlock {
  $type: "app.sonasky.apollo.defs#event";
  name: string;
  /** ISO datetime. */
  start: string;
  end?: string;
  /** IANA zone the times are shown in, e.g. "America/New_York". */
  timezone?: string;
  location?: string;
  url?: string;
}

export type LabelsLayout = "grouped" | "combined";

/** The site owner's labels from one or more labelers (SonaSky, SonaSky Pokémon, ...). */
export interface LabelsBlock {
  $type: "app.sonasky.apollo.defs#labels";
  /** Labeler DIDs, in display order. */
  labelers: string[];
  /** One section per labeler, or every label in a single row. */
  layout?: LabelsLayout;
  title?: string;
}

export interface DividerBlock {
  $type: "app.sonasky.apollo.defs#divider";
}

export interface SpacerBlock {
  $type: "app.sonasky.apollo.defs#spacer";
  size: "small" | "medium" | "large";
}

/**
 * A block type from @sonasky/apollo-blocks. `fields` is checked against that
 * block's definition on write; unknown ids are skipped when rendering.
 */
export interface CommunityBlock {
  $type: "app.sonasky.apollo.defs#community";
  /** Community block id, e.g. "pull-quote". */
  block: string;
  fields: Record<string, unknown>;
}

export type Block =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonsBlock
  | GalleryBlock
  | BskyPostBlock
  | BskyProfileBlock
  | StarterPackBlock
  | EventBlock
  | LabelsBlock
  | DividerBlock
  | SpacerBlock
  | CommunityBlock;
export type BlockType = Block["$type"];

// Content records

interface ContentFields {
  title: string;
  description?: string;
  format: PageFormat;
  blocks?: Block[];
  /** Markdown or HTML source, for the `markdown` / `html` formats. */
  body?: string;
  /** Layout rkey; falls back to the site's `defaultLayout`, then the built-in one. */
  layout?: string;
  /** Extra style / script rkeys, applied after the site theme. */
  styles?: string[];
  scripts?: string[];
  ogImage?: string;
  labels?: SelfLabels;
  createdAt: string;
  updatedAt: string;
}

export interface PageRecord extends ContentFields {
  $type: typeof NSID_PAGE;
}

export interface PostRecord extends ContentFields {
  $type: typeof NSID_POST;
  publishedAt: string;
  tags?: string[];
}

/** Visual theme tokens - defined by @sonasky/apollo-themes, which owns the theme catalog. */
export type { ThemeFont, ThemeRadius, ThemeTokens, ThemeWidth } from "@sonasky/apollo-themes";

export interface StyleRecord {
  $type: typeof NSID_STYLE;
  name: string;
  tokens?: ThemeTokens;
  /**
   * Id of the catalog theme these tokens were copied from (for credit and the
   * picker's "current" state). The tokens themselves are the source of truth.
   */
  basedOn?: string;
  /** Hand-written CSS (Advanced). Applied after the tokens. */
  css?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptRecord {
  $type: typeof NSID_SCRIPT;
  name: string;
  js: string;
  createdAt: string;
  updatedAt: string;
}

/** Slots: {{content}} {{nav}} {{title}} {{site.title}}. */
export interface LayoutRecord {
  $type: typeof NSID_LAYOUT;
  name: string;
  html: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaRecord {
  $type: typeof NSID_MEDIA;
  file: BlobRef;
  /** Required unless `noAlt` is set. */
  alt: string;
  /** The uploader explicitly chose not to describe this file (alt is then ""). */
  noAlt?: boolean;
  width?: number;
  height?: number;
  createdAt: string;
}

// Rings

/** A site invited to a ring. No `$type`, so backlink indexes see `.members[].did`. */
export interface RingMemberRef {
  did: string;
  addedAt: string;
}

/**
 * A webring, in its owner's repo (rkey = slug). Owning a ring doesn't need a
 * site. A member counts only when it is listed here AND its repo has a
 * matching `RingMemberRecord` - the invite and the acceptance.
 */
export interface RingRecord {
  $type: typeof NSID_RING;
  name: string;
  description?: string;
  /** The ring index page's own content. */
  format: "markdown" | "html";
  body?: string;
  /** Style rkey in the owner's repo; falls back to the owner's site theme. */
  theme?: string;
  /** Ring order: prev/next walk this list. */
  members: RingMemberRef[];
  /** Keep the ring out of the public ring directory. It still works by link. */
  unlisted?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A site's acceptance of a ring invite. Its presence is the member's consent. */
export interface RingMemberRecord {
  $type: typeof NSID_RING_MEMBER;
  /** at://<owner>/app.sonasky.apollo.ring/<slug> */
  ring: string;
  createdAt: string;
}

export type ApolloRecord =
  | SiteRecord
  | PageRecord
  | PostRecord
  | StyleRecord
  | ScriptRecord
  | LayoutRecord
  | MediaRecord
  | RingRecord
  | RingMemberRecord;

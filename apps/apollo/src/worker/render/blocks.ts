import { blockClass, findCommunityBlock, type RenderHelpers } from "@sonasky/apollo-blocks";
import { upgradeBlock } from "../../shared/communityUpgrades.ts";
import { BADGE_HEIGHT, BADGE_WIDTH } from "../../shared/badges.ts";
import type {
  BadgesBlock,
  Block,
  BskyPostBlock,
  CommunityBlock,
  EventBlock,
  StarterPackBlock,
} from "../../shared/records.ts";
import {
  fetchPostCards,
  fetchProfileCard,
  fetchStarterPackCard,
  safeAvatar,
  type PostCard,
} from "./bsky.ts";
import { esc } from "./escape.ts";
import { icon } from "./icons.ts";
import { renderComments } from "./comments.ts";
import { renderLabels } from "./labels.ts";
import { markdownToHtml } from "./markdown.ts";
import type { LoadedBadge } from "../badges.ts";

export interface BlockContext {
  /** DID of the site owner (whose labels the labels block shows). */
  did: string;
  /** Public URLs of the page being rendered, most canonical first (for Bluesky comments). */
  pageUrls: string[];
  /** Public URL for a media rkey, or null if it isn't a valid rkey. */
  mediaUrl: (rkey: string) => string | null;
  /** Same rules as the sanitizer's href rewriting; null drops the link. */
  rewriteHref: (href: string) => string | null;
  sanitize: (html: string) => Promise<string>;
  /** Badges for badges blocks, loaded before rendering. */
  badges: Map<string, LoadedBadge>;
  /** Media and link rewriting for an account's own site (this one, or a badge's owner). */
  urlsFor: (did: string) => {
    mediaUrl: (rkey: string) => string | null;
    rewriteHref: (href: string) => string | null;
  };
}

const IMAGE_SIZES = new Set(["small", "medium", "full"]);
const SPACER_SIZES = new Set(["small", "medium", "large"]);

export function formatEventTime(iso: string, timezone: string | undefined): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // dateStyle/timeStyle can't be combined with timeZoneName, so spell the
  // fields out: "Saturday, October 24, 2026 at 7:00 PM EDT".
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timezone }).format(date);
  } catch {
    // Unknown zone - fall back to UTC.
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  }
}

function hiddenCard(url: string, label: string): string {
  return `<a class="apollo-card" href="${esc(url)}"><p class="apollo-card-text">${esc(label)}</p><span class="apollo-card-cta">View on Bluesky</span></a>`;
}

function profileHead(p: { avatar?: string; displayName?: string; handle: string }): string {
  const avatar = safeAvatar(p.avatar);
  return `<div class="apollo-card-head">${
    avatar ? `<img class="apollo-card-avatar" src="${esc(avatar)}" alt="" loading="lazy">` : ""
  }<div><div class="apollo-card-name">${esc(p.displayName || p.handle)}</div><div class="apollo-card-sub">@${esc(p.handle)}</div></div></div>`;
}

function renderPost(block: BskyPostBlock, cards: Map<string, PostCard>): string {
  const card = cards.get(block.uri);
  if (!card) return "";
  if (card.hidden) return hiddenCard(card.url, "This post has a content warning.");
  return `<a class="apollo-card" href="${esc(card.url)}">${profileHead(card.author)}<p class="apollo-card-text">${esc(card.text)}</p></a>`;
}

async function renderStarterPack(block: StarterPackBlock): Promise<string> {
  const card = await fetchStarterPackCard(block.uri);
  if (!card) return "";
  if (card.hidden) return hiddenCard(card.url, "This starter pack has a content warning.");
  const count = card.memberCount ? ` · ${card.memberCount} people` : "";
  return `<a class="apollo-card" href="${esc(card.url)}"><div class="apollo-card-name">${esc(card.name)}</div><div class="apollo-card-sub">by @${esc(card.creator.handle)}${esc(count)}</div>${
    card.description ? `<p class="apollo-card-text">${esc(card.description)}</p>` : ""
  }<span class="apollo-card-cta">Join on Bluesky</span></a>`;
}

function renderEvent(block: EventBlock, ctx: BlockContext): string {
  const start = formatEventTime(block.start, block.timezone);
  const end = block.end ? formatEventTime(block.end, block.timezone) : null;
  const href = block.url ? ctx.rewriteHref(block.url) : null;
  return `<section class="apollo-card apollo-event"><p class="apollo-event-name">${esc(block.name)}</p>${
    start
      ? `<p class="apollo-event-meta">${icon("calendarDays")} ${esc(start)}${end ? ` - ${esc(end)}` : ""}</p>`
      : ""
  }${block.location ? `<p class="apollo-event-meta">${icon("mapPin")} ${esc(block.location)}</p>` : ""}${
    href ? `<a class="apollo-card-cta" href="${esc(href)}">Event details</a>` : ""
  }</section>`;
}

/**
 * A block from @sonasky/apollo-blocks. Its markdown fields are rendered first
 * (sanitizing is async, a block's `render` isn't), and its output is
 * sanitized like any other author HTML.
 */
export async function renderCommunityBlock(
  block: CommunityBlock,
  ctx: BlockContext,
): Promise<string> {
  const def = findCommunityBlock(block.block);
  if (!def) return "";
  const fields = block.fields ?? {};
  const html = new Map<string, string>();
  for (const [key, f] of Object.entries(def.fields)) {
    const value = fields[key];
    if (f.type === "markdown" && typeof value === "string" && value) {
      html.set(key, await ctx.sanitize(markdownToHtml(value)));
    }
  }
  const h: RenderHelpers = {
    esc,
    html: (key) => html.get(key) ?? "",
    href: (url) => (url ? ctx.rewriteHref(url) : null),
    mediaUrl: (rkey) => (rkey ? ctx.mediaUrl(rkey) : null),
    formatDate: (iso, timezone) => (iso ? formatEventTime(iso, timezone) : null),
  };
  // Values were checked on write; render with them as the block declared.
  const out = def.render(fields as Parameters<typeof def.render>[0], h);
  return `<div class="apollo-cb ${blockClass(def.id)}">${await ctx.sanitize(out)}</div>`;
}

function renderBadges(block: BadgesBlock, ctx: BlockContext): string {
  const scale = block.scale === 2 ? 2 : 1;
  const items = (Array.isArray(block.items) ? block.items : [])
    .map((item) => {
      const badge = ctx.badges.get(item?.uri);
      if (!badge) return "";
      const urls = ctx.urlsFor(badge.did);
      const src = urls.mediaUrl(badge.media);
      if (!src) return "";
      const img = `<img src="${esc(src)}" alt="${esc(badge.alt)}" width="${BADGE_WIDTH * scale}" height="${BADGE_HEIGHT * scale}" loading="lazy">`;
      const href = badge.href ? urls.rewriteHref(badge.href) : null;
      return href
        ? `<a href="${esc(href)}"${badge.alt ? ` title="${esc(badge.alt)}"` : ""}>${img}</a>`
        : img;
    })
    .join("");
  if (!items) return "";
  const classes = ["apollo-badges"];
  if (block.align === "center") classes.push("apollo-badges-center");
  return `<div class="${classes.join(" ")}">${items}</div>`;
}

/** Render a page's blocks to (sanitized) HTML. */
export async function renderBlocks(input: Block[], ctx: BlockContext): Promise<string> {
  const blocks = input.map(upgradeBlock);
  const postUris = blocks
    .filter((b): b is BskyPostBlock => b.$type === "app.sonasky.apollo.defs#bskyPost")
    .map((b) => b.uri);
  const postCards = postUris.length ? await fetchPostCards(postUris) : new Map();

  const parts = await Promise.all(
    blocks.map((block) =>
      renderBlock(block, ctx, postCards).catch((err: unknown) => {
        // One broken block (bad data from another client, an upstream hiccup)
        // shouldn't blank the whole page.
        console.warn(`render: ${block.$type} block failed`, err);
        return "";
      }),
    ),
  );
  return parts.join("\n");
}

async function renderBlock(
  block: Block,
  ctx: BlockContext,
  postCards: Map<string, PostCard>,
): Promise<string> {
  switch (block.$type) {
    case "app.sonasky.apollo.defs#heading": {
      const level = [1, 2, 3].includes(block.level) ? block.level : 2;
      return `<h${level}>${esc(block.text)}</h${level}>`;
    }
    case "app.sonasky.apollo.defs#text":
      return ctx.sanitize(markdownToHtml(block.markdown ?? ""));
    case "app.sonasky.apollo.defs#image": {
      const src = ctx.mediaUrl(block.media);
      if (!src) return "";
      const size = IMAGE_SIZES.has(block.size ?? "") ? block.size : "full";
      return `<figure class="apollo-image apollo-image-${size}"><img src="${esc(src)}" alt="${esc(block.alt)}" loading="lazy">${
        block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""
      }</figure>`;
    }
    case "app.sonasky.apollo.defs#buttons":
      return `<nav class="apollo-buttons">${(block.items ?? [])
        .map((item) => {
          const href = ctx.rewriteHref(item.url);
          return href ? `<a class="apollo-button" href="${esc(href)}">${esc(item.label)}</a>` : "";
        })
        .join("")}</nav>`;
    case "app.sonasky.apollo.defs#badges":
      return renderBadges(block, ctx);
    case "app.sonasky.apollo.defs#gallery":
      return `<div class="apollo-gallery">${(block.items ?? [])
        .map((item) => {
          const src = ctx.mediaUrl(item.media);
          return src ? `<img src="${esc(src)}" alt="${esc(item.alt)}" loading="lazy">` : "";
        })
        .join("")}</div>`;
    case "app.sonasky.apollo.defs#bskyPost":
      return renderPost(block, postCards);
    case "app.sonasky.apollo.defs#bskyProfile": {
      const card = await fetchProfileCard(block.did);
      if (!card) return "";
      if (card.hidden) return hiddenCard(card.url, "This profile has a content warning.");
      return `<a class="apollo-card" href="${esc(card.url)}">${profileHead(card.profile)}${
        card.profile.description
          ? `<p class="apollo-card-text">${esc(card.profile.description)}</p>`
          : ""
      }<span class="apollo-card-cta">Follow on Bluesky</span></a>`;
    }
    case "app.sonasky.apollo.defs#starterPack":
      return renderStarterPack(block);
    case "app.sonasky.apollo.defs#event":
      return renderEvent(block, ctx);
    case "app.sonasky.apollo.defs#labels":
      return renderLabels(block, ctx.did);
    case "app.sonasky.apollo.defs#bskyComments":
      return renderComments(block, ctx);
    case "app.sonasky.apollo.defs#divider":
      return `<hr class="apollo-divider">`;
    case "app.sonasky.apollo.defs#spacer": {
      const size = SPACER_SIZES.has(block.size) ? block.size : "medium";
      return `<div class="apollo-spacer-${size}" aria-hidden="true"></div>`;
    }
    case "app.sonasky.apollo.defs#community":
      return renderCommunityBlock(block, ctx);
    default:
      // Unknown block type (newer client, or a hand-written record): skip it.
      return "";
  }
}

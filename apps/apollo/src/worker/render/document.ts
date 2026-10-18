/**
 * Assemble a user's site page into a complete HTML document for the usercontent
 * origin. Everything author-supplied goes through `sanitizeHtml` or `esc`; the
 * theme CSS is generated from validated tokens; script records are referenced
 * by URL (never inlined) so the CSP can pin them to this site.
 */

import { findCommunityBlock, scopedCss } from "@sonasky/apollo-blocks";
import { upgradeBlock } from "../../shared/communityUpgrades.ts";
import type {
  Block,
  LayoutRecord,
  PageRecord,
  PostRecord,
  RingRecord,
  SiteRecord,
  StyleRecord,
} from "../../shared/records.ts";
import type { RecordEntry } from "../atproto/repo.ts";
import type { RingNav, RosterMember } from "../rings.ts";
import { renderBlocks, type BlockContext } from "./blocks.ts";
import { expandLabelPlaceholders } from "./labels.ts";
import { esc } from "./escape.ts";
import { markdownToHtml } from "./markdown.ts";
import { safeStyleText, sanitizeHtml } from "./sanitize.ts";
import { googleFontFamilies, googleFontsHref, themeCss } from "../../shared/themeCss.ts";

export type RenderTarget =
  | { kind: "page"; slug: string; record: PageRecord }
  | { kind: "post"; slug: string; record: PostRecord }
  | { kind: "blog"; posts: RecordEntry<PostRecord>[] };

export interface RenderInput {
  did: string;
  /** Handle (or DID) used to build viewer URLs: `/@<actor>/...`. */
  actor: string;
  site: SiteRecord;
  target: RenderTarget;
  /** The site theme first, then the page's extra styles, in order. */
  styles: StyleRecord[];
  layout?: LayoutRecord;
  /** Script records to load, by rkey + cid (cid busts caches). Empty in previews. */
  scripts: { rkey: string; cid: string }[];
  /** Rings this site belongs to. Their navs are always rendered, whatever the layout. */
  rings?: RingNav[];
}

export interface RenderOrigins {
  publicOrigin: string;
  usercontentOrigin: string;
}

const RKEY_RE = /^[a-zA-Z0-9._~:-]{1,512}$/;
const LANG_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SITE_PATH_RE = /^[a-z0-9-]*(\/[a-z0-9-]+)?$/;

export interface UrlRewriters {
  mediaUrl: (rkey: string) => string | null;
  rewriteHref: (href: string) => string | null;
  rewriteSrc: (src: string) => string | null;
  /** Viewer URL for a page slug ("" / the home page slug -> site root). */
  pageUrl: (slug: string) => string;
}

export function urlRewriters(
  origins: RenderOrigins,
  did: string,
  actor: string,
  homePage: string,
): UrlRewriters {
  const siteRoot = `${origins.publicOrigin}/@${actor}`;
  const mediaUrl = (rkey: string) =>
    RKEY_RE.test(rkey) ? `${origins.usercontentOrigin}/m/${did}/${rkey}` : null;
  const pageUrl = (slug: string) =>
    slug === "" || slug === homePage ? siteRoot : `${siteRoot}/${slug}`;

  const rewriteHref = (raw: string): string | null => {
    const href = raw.trim();
    if (!href) return null;
    if (href.startsWith("#")) return href;
    if (href.startsWith("media:")) return mediaUrl(href.slice("media:".length));
    if (href.startsWith("//")) return `https:${href}`;
    if (SCHEME_RE.test(href)) {
      return /^(https?|mailto):/i.test(href) ? href : null;
    }
    // A relative link means "another page on this site": "/about", "about",
    // "./about", "blog/hello". Query strings and fragments are dropped.
    const path = href
      .replace(/[?#].*$/, "")
      .replace(/^(\.\/|\/)+/, "")
      .replace(/\/+$/, "");
    if (!SITE_PATH_RE.test(path)) return null;
    return pageUrl(path);
  };

  const rewriteSrc = (raw: string): string | null => {
    const src = raw.trim();
    if (src.startsWith("media:")) return mediaUrl(src.slice("media:".length));
    if (DATA_IMAGE_RE.test(src)) return src;
    if (src.startsWith("https://cdn.bsky.app/")) return src;
    if (src.startsWith(`${origins.usercontentOrigin}/m/${did}/`)) return src;
    return null;
  };

  return { mediaUrl, rewriteHref, rewriteSrc, pageUrl };
}

function renderNav(site: SiteRecord, urls: UrlRewriters, currentSlug: string | null): string {
  const items = (site.nav ?? [])
    .map((item) => {
      const href =
        item.page !== undefined
          ? urls.pageUrl(item.page)
          : item.url
            ? urls.rewriteHref(item.url)
            : null;
      if (!href) return "";
      const current =
        item.page !== undefined && item.page === currentSlug ? ' aria-current="page"' : "";
      return `<li><a href="${esc(href)}"${current}>${esc(item.label)}</a></li>`;
    })
    .join("");
  return items ? `<nav class="apollo-nav" aria-label="Site"><ul>${items}</ul></nav>` : "";
}

/** Base styles for ring navs and ring pages; site CSS still layers on top. */
const RING_CSS = `.apollo-ring{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 14px;margin-top:10px}
.apollo-ring a{color:inherit}
.apollo-ring-name{font-weight:600}
.apollo-ring-footer{max-width:var(--apollo-width);margin:48px auto 24px;padding:0 16px}
.apollo-ring-members{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.apollo-ring-members .apollo-card{margin:0;height:100%}
.apollo-ring-random{margin:1.5em 0}`;

/** One "<- Previous · Ring · Next ->" row per ring. */
export function renderRingNav(rings: RingNav[] | undefined): string {
  return (rings ?? [])
    .map(
      (r) =>
        `<nav class="apollo-ring" aria-label="${esc(`Webring: ${r.name}`)}"><a href="${esc(
          r.prevUrl,
        )}" rel="prev">&larr; Previous</a><a class="apollo-ring-name" href="${esc(
          r.indexUrl,
        )}">${esc(r.name)}</a><a href="${esc(r.nextUrl)}" rel="next">Next &rarr;</a></nav>`,
    )
    .join("");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(d);
}

async function renderBody(record: PageRecord | PostRecord, ctx: BlockContext): Promise<string> {
  switch (record.format) {
    case "blocks":
      return renderBlocks(record.blocks ?? [], ctx);
    case "markdown":
      return expandLabelPlaceholders(
        await ctx.sanitize(markdownToHtml(record.body ?? "")),
        ctx.did,
      );
    case "html":
      return expandLabelPlaceholders(await ctx.sanitize(record.body ?? ""), ctx.did);
    default:
      return "";
  }
}

function pageTitle(input: RenderInput): string {
  const { site, target } = input;
  if (target.kind === "blog") return `Blog · ${site.title}`;
  if (target.kind === "page" && target.slug === site.homePage) return site.title;
  return `${target.record.title} · ${site.title}`;
}

export async function renderSiteDocument(
  input: RenderInput,
  origins: RenderOrigins,
): Promise<string> {
  const { did, actor, site, target } = input;
  const urls = urlRewriters(origins, did, actor, site.homePage);
  const sanitize = (html: string) =>
    sanitizeHtml(html, { rewriteHref: urls.rewriteHref, rewriteSrc: urls.rewriteSrc });
  const ctx: BlockContext = {
    did,
    mediaUrl: urls.mediaUrl,
    rewriteHref: urls.rewriteHref,
    sanitize,
  };

  let content: string;
  let currentSlug: string | null = null;
  if (target.kind === "blog") {
    const items = [...target.posts]
      .sort((a, b) => (b.value.publishedAt ?? "").localeCompare(a.value.publishedAt ?? ""))
      .map(
        (p) =>
          `<li><a href="${esc(urls.pageUrl(`blog/${p.rkey}`))}">${esc(p.value.title)}</a><div class="apollo-post-meta">${esc(formatDate(p.value.publishedAt))}</div>${
            p.value.description ? `<p>${esc(p.value.description)}</p>` : ""
          }</li>`,
      )
      .join("");
    content = `<h1>Blog</h1>${items ? `<ul class="apollo-post-list">${items}</ul>` : "<p>No posts yet.</p>"}`;
  } else if (target.kind === "post") {
    content = `<article><h1>${esc(target.record.title)}</h1><p class="apollo-post-meta">${esc(
      formatDate(target.record.publishedAt),
    )}</p>${await renderBody(target.record, ctx)}</article>`;
  } else {
    currentSlug = target.slug;
    content = await renderBody(target.record, ctx);
  }

  const nav = renderNav(site, urls, currentSlug);
  const title = pageTitle(input);
  const ringNav = renderRingNav(input.rings);

  let body: string;
  if (input.layout?.html) {
    const layout = await sanitize(input.layout.html);
    const slots: Record<string, string> = {
      content,
      nav,
      title: esc(title),
      "site.title": esc(site.title),
    };
    // Single pass, so slot text inside `content` is never re-expanded.
    body = layout.replace(
      /\{\{\s*(content|nav|title|site\.title)\s*\}\}/g,
      (_, key: string) => slots[key],
    );
    // A layout can't leave out ring navs: membership requires showing them.
    if (ringNav) body += `<footer class="apollo-footer apollo-ring-footer">${ringNav}</footer>`;
  } else {
    body = `<div class="apollo-wrap"><header class="apollo-header"><a class="apollo-site-title" href="${esc(
      urls.pageUrl(""),
    )}">${esc(site.title)}</a>${nav}</header><main>${content}</main><footer class="apollo-footer">Made with <a href="${esc(
      origins.publicOrigin,
    )}">SonaSky Apollo</a>${ringNav}</footer></div>`;
  }

  const scripts = input.scripts
    .filter((s) => RKEY_RE.test(s.rkey))
    .map(
      (s) =>
        `<script src="${esc(`${origins.usercontentOrigin}/s/${did}/script/${s.rkey}.js?v=${encodeURIComponent(s.cid)}`)}"></script>`,
    )
    .join("");

  return documentHtml(
    {
      lang: site.lang,
      title,
      styles: input.styles,
      blockCss: target.kind === "blog" ? [] : communityBlockCss(target.record.blocks ?? []),
      body: body + scripts,
    },
    origins,
  );
}

/** Scoped CSS for each community block type on the page, once each. */
export function communityBlockCss(blocks: Block[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks.map(upgradeBlock)) {
    if (block.$type === "app.sonasky.apollo.defs#community") ids.add(block.block);
  }
  return [...ids].flatMap((id) => {
    const def = findCommunityBlock(id);
    const css = def ? scopedCss(def) : "";
    return css ? [css] : [];
  });
}

/**
 * The `<html>` around a rendered body: theme CSS, fonts and Apollo's bootstrap
 * script. Community block CSS goes after the theme and before the site's own
 * styles, so a site can still restyle any block.
 */
function documentHtml(
  opts: {
    lang?: string;
    title: string;
    styles: StyleRecord[];
    blockCss?: string[];
    body: string;
  },
  origins: RenderOrigins,
): string {
  const tokens = opts.styles[0]?.tokens;
  const css = [
    themeCss(tokens),
    RING_CSS,
    ...(opts.blockCss ?? []),
    ...opts.styles.map((s) => s.css ?? ""),
  ]
    .map(safeStyleText)
    .join("\n");
  const fonts = googleFontFamilies(tokens);
  const fontLink = fonts.length
    ? `<link rel="stylesheet" href="${esc(googleFontsHref(origins.usercontentOrigin, fonts))}">`
    : "";
  const lang = opts.lang && LANG_RE.test(opts.lang) ? opts.lang : "en";
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(
    opts.title,
  )}</title><script src="${esc(`${origins.usercontentOrigin}/_apollo/bootstrap.js`)}"></script>${fontLink}<style>${css}</style></head><body>${opts.body}</body></html>`;
}

export interface RingRenderInput {
  ownerDid: string;
  /** Owner handle (or DID) for viewer URLs. */
  ownerActor: string;
  slug: string;
  ring: RingRecord;
  /** The ring's theme first; falls back to defaults when empty. */
  styles: StyleRecord[];
  /** Listed members, in ring order. */
  members: RosterMember[];
}

/** A ring's index page: the owner's content, a random-site button and the member list. */
export async function renderRingDocument(
  input: RingRenderInput,
  origins: RenderOrigins,
): Promise<string> {
  const { ring } = input;
  // Relative links in the ring's content point at the owner's own site.
  const urls = urlRewriters(origins, input.ownerDid, input.ownerActor, "");
  const content =
    ring.format === "html"
      ? await sanitizeHtml(ring.body ?? "", urls)
      : await sanitizeHtml(markdownToHtml(ring.body ?? ""), urls);
  const ringUrl = `${origins.publicOrigin}/@${input.ownerActor}/ring/${input.slug}`;

  const cards = input.members
    .map((m) => {
      const byline = m.handle ? `@${m.handle}` : m.did;
      const avatar = m.avatar
        ? `<img class="apollo-card-avatar" src="${esc(m.avatar)}" alt="">`
        : "";
      return `<li><a class="apollo-card" href="${esc(m.url)}"><div class="apollo-card-head">${avatar}<div><div class="apollo-card-name">${esc(
        m.title,
      )}</div><div class="apollo-card-sub">${esc(m.displayName ? `${m.displayName} · ${byline}` : byline)}</div></div></div>${
        m.description ? `<p class="apollo-card-text">${esc(m.description)}</p>` : ""
      }</a></li>`;
    })
    .join("");
  const members = input.members.length
    ? `<h2>Members (${input.members.length})</h2><ul class="apollo-ring-members">${cards}</ul>`
    : "<p>No sites have joined this ring yet.</p>";
  const random = input.members.length
    ? `<p class="apollo-ring-random"><a class="apollo-button" href="${esc(`${ringUrl}/random`)}">Visit a random site</a></p>`
    : "";

  const body = `<div class="apollo-wrap"><header class="apollo-header"><a class="apollo-site-title" href="${esc(
    ringUrl,
  )}">${esc(ring.name)}</a></header><main><h1>${esc(ring.name)}</h1>${
    ring.description ? `<p>${esc(ring.description)}</p>` : ""
  }${content}${random}${members}</main><footer class="apollo-footer">A webring on <a href="${esc(
    origins.publicOrigin,
  )}">SonaSky Apollo</a></footer></div>`;

  return documentHtml({ title: `${ring.name} · Webring`, styles: input.styles, body }, origins);
}

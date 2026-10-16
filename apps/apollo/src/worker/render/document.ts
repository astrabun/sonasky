/**
 * Assemble a user's site page into a complete HTML document for the usercontent
 * origin. Everything author-supplied goes through `sanitizeHtml` or `esc`; the
 * theme CSS is generated from validated tokens; script records are referenced
 * by URL (never inlined) so the CSP can pin them to this site.
 */

import type {
  LayoutRecord,
  PageRecord,
  PostRecord,
  SiteRecord,
  StyleRecord,
} from "../../shared/records.ts";
import type { RecordEntry } from "../atproto/repo.ts";
import { renderBlocks, type BlockContext } from "./blocks.ts";
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
      return ctx.sanitize(markdownToHtml(record.body ?? ""));
    case "html":
      return ctx.sanitize(record.body ?? "");
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
  const ctx: BlockContext = { mediaUrl: urls.mediaUrl, rewriteHref: urls.rewriteHref, sanitize };

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
  } else {
    body = `<div class="apollo-wrap"><header class="apollo-header"><a class="apollo-site-title" href="${esc(
      urls.pageUrl(""),
    )}">${esc(site.title)}</a>${nav}</header><main>${content}</main><footer class="apollo-footer">Made with <a href="${esc(
      origins.publicOrigin,
    )}">SonaSky Apollo</a></footer></div>`;
  }

  const css = [themeCss(input.styles[0]?.tokens), ...input.styles.map((s) => s.css ?? "")]
    .map(safeStyleText)
    .join("\n");
  const fonts = googleFontFamilies(input.styles[0]?.tokens);
  const fontLink = fonts.length
    ? `<link rel="stylesheet" href="${esc(googleFontsHref(origins.usercontentOrigin, fonts))}">`
    : "";
  const lang = site.lang && LANG_RE.test(site.lang) ? site.lang : "en";
  const scripts = input.scripts
    .filter((s) => RKEY_RE.test(s.rkey))
    .map(
      (s) =>
        `<script src="${esc(`${origins.usercontentOrigin}/s/${did}/script/${s.rkey}.js?v=${encodeURIComponent(s.cid)}`)}"></script>`,
    )
    .join("");

  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(
    title,
  )}</title><script src="${esc(`${origins.usercontentOrigin}/_apollo/bootstrap.js`)}"></script>${fontLink}<style>${css}</style></head><body>${body}${scripts}</body></html>`;
}

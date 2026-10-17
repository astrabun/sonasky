/**
 * Public viewer on the Apollo host:
 *
 *   /@:actor             site home page
 *   /@:actor/:slug       a page
 *   /@:actor/blog        blog index
 *   /@:actor/blog/:slug  a blog post
 *   /@:actor/ring/:slug  a ring's index page
 *   /@:actor/ring/:slug/{prev,next,random}  ring navigation (redirects)
 *
 * Returns a small shell: Apollo's top bar (attribution + Report) and a
 * sandboxed iframe pointing at the usercontent origin, plus server-rendered
 * OpenGraph tags from the site/page records. The site's own HTML never runs on
 * this origin.
 */

import { Hono, type Context } from "hono";
import { NSID_SITE, SITE_RKEY } from "../../shared/nsid.ts";
import { isSlug } from "../../shared/slug.ts";
import { isDid, isHandle, resolveActor, type ResolvedIdentity } from "../atproto/identity.ts";
import { origin, swetrixConfig, type AppEnv, type SwetrixConfig } from "../env.ts";
import { checkModeration } from "../moderation.ts";
import { SECURITY_HEADERS, shellCsp } from "../render/csp.ts";
import { esc } from "../render/escape.ts";
import { icon } from "../render/icons.ts";
import { BASE_STYLES, notFoundPage, staticPage, unavailablePage } from "../render/pages.ts";
import { loadRing, neighbor, randomMember, ringPageUrl, ringRoster } from "../rings.ts";
import { loadSite, type TargetSpec } from "../site-loader.ts";

type Ctx = Context<{ Bindings: AppEnv }>;

export const viewerRoutes = new Hono<{ Bindings: AppEnv }>();

const MEDIA_RKEY_RE = /^[a-zA-Z0-9._~:-]{1,512}$/;

/** Short, stable cache-buster for the iframe URL. */
async function version(parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
  return [...new Uint8Array(digest).slice(0, 6)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pathFor(spec: TargetSpec): string {
  if (spec.kind === "blog") return "/blog";
  if (spec.kind === "post") return `/blog/${spec.slug}`;
  return spec.slug ? `/${spec.slug}` : "";
}

const SHELL_STYLES = `${BASE_STYLES}
html,body{height:100%}
body{display:flex;flex-direction:column}
.bar{display:flex;align-items:center;gap:12px;height:36px;padding:0 12px;border-bottom:1px solid var(--border);background:var(--card);font-size:.8rem;flex:none}
.bar a{color:var(--muted);text-decoration:none}
.bar a:hover{color:var(--text)}
.bar .home{display:inline-flex;align-items:center;gap:4px}
.bar .title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.bar .title a{color:var(--muted)}
iframe{flex:1;width:100%;border:0;display:block;background:#fff}`;

async function renderShell(c: Ctx, rawActor: string, spec: TargetSpec): Promise<Response> {
  const publicOrigin = origin(c.env.PUBLIC_URL);
  const ucOrigin = origin(c.env.USERCONTENT_URL);

  const resolved = await resolveViewerActor(c, rawActor, pathFor(spec));
  if (resolved instanceof Response) return resolved;
  const { identity, actor } = resolved;

  const loaded = await loadSite(identity.pds, identity.did, spec);
  if (!loaded) {
    return notFoundPage(
      spec.kind === "page" && !spec.slug
        ? "This account hasn't made an Apollo site yet."
        : "This page doesn't exist on this site.",
    );
  }

  const verdict = await checkModeration(c.env, identity.did, identity.pds, loaded.selfLabels);
  if (verdict.kind === "unavailable") return unavailablePage();

  const acceptedWarning = c.req.query("cw") === "1";
  const canonical = `${publicOrigin}/@${actor}${pathFor(spec)}`;
  if (verdict.kind === "warn" && !acceptedWarning) {
    return staticPage({
      title: "Content warning",
      backScript: true,
      body: `<h1>Content warning</h1><p>This site may contain content some people don't want to see${
        verdict.labels.includes("graphic-media") || verdict.labels.includes("gore")
          ? " (graphic or disturbing media)"
          : " (adult content)"
      }.</p><div class="actions"><a class="btn" href="/" data-back>Go back</a><a class="btn btn-primary" href="${esc(
        `${canonical}?cw=1`,
      )}">Show anyway</a></div>`,
    });
  }

  const site = loaded.site.value;
  const target = loaded.target;
  const isHome = target.kind === "page" && target.slug === site.homePage;
  const contentTitle = target.kind === "blog" ? "Blog" : isHome ? site.title : target.record.title;
  const fullTitle = isHome ? site.title : `${contentTitle} · ${site.title}`;
  const description =
    (target.kind !== "blog" && !isHome ? target.record.description : undefined) ??
    site.og?.description ??
    site.description ??
    "";
  const mediaUrl = (rkey: string | undefined) =>
    rkey && MEDIA_RKEY_RE.test(rkey) ? `${ucOrigin}/m/${identity.did}/${rkey}` : undefined;
  const ogImage =
    mediaUrl(target.kind !== "blog" ? target.record.ogImage : undefined) ?? mediaUrl(site.ogImage);
  const favicon = mediaUrl(site.favicon) ?? "/sonasky_favicon.png";

  const docPath =
    target.kind === "blog"
      ? "blog"
      : target.kind === "post"
        ? `post/${target.slug}`
        : `page/${target.slug}`;
  const v = await version([
    loaded.site.cid,
    loaded.targetCid ?? "",
    ...loaded.scripts.map((s) => s.cid),
  ]);
  const frameParams = new URLSearchParams({ a: actor, v });
  if (acceptedWarning) frameParams.set("cw", "1");
  const frameSrc = `${ucOrigin}/r/${identity.did}/${docPath}?${frameParams.toString()}`;

  const reportParams = new URLSearchParams(
    loaded.targetUri && loaded.targetCid
      ? { uri: loaded.targetUri, cid: loaded.targetCid }
      : { uri: loaded.site.uri, cid: loaded.site.cid },
  );
  reportParams.set("site", `at://${identity.did}/${NSID_SITE}/${SITE_RKEY}`);
  reportParams.set("siteCid", loaded.site.cid);

  const meta: [string, string, string][] = [
    ["name", "description", description],
    ["property", "og:type", target.kind === "post" ? "article" : "website"],
    ["property", "og:site_name", site.title],
    ["property", "og:title", site.og?.title && isHome ? site.og.title : fullTitle],
    ["property", "og:description", description],
    ["property", "og:url", canonical],
    ["name", "twitter:card", ogImage ? "summary_large_image" : "summary"],
    ["name", "twitter:title", fullTitle],
    ["name", "twitter:description", description],
  ];
  if (ogImage) {
    meta.push(["property", "og:image", ogImage], ["name", "twitter:image", ogImage]);
  }
  return shellResponse({
    title: fullTitle,
    barTitle: site.title,
    meta,
    canonical,
    favicon,
    frameSrc,
    reportHref: `/report?${reportParams.toString()}`,
    identity,
    ucOrigin,
    analytics: swetrixConfig(c.env),
  });
}

/** Apollo's top bar + the sandboxed iframe, with OG tags. Shared by sites and ring pages. */
function shellResponse(opts: {
  title: string;
  barTitle: string;
  meta: [string, string, string][];
  canonical: string;
  favicon: string;
  frameSrc: string;
  reportHref: string;
  identity: { did: string; handle?: string };
  ucOrigin: string;
  analytics: SwetrixConfig | null;
}): Response {
  const { identity, analytics } = opts;
  const analyticsAttrs = analytics
    ? ` data-swetrix-api="${esc(analytics.apiURL)}" data-swetrix-pid="${esc(analytics.projectId)}"`
    : "";
  const metaTags = opts.meta
    .filter(([, , value]) => value)
    .map(([attr, key, value]) => `<meta ${attr}="${esc(key)}" content="${esc(value)}">`)
    .join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(
    opts.title,
  )}</title>${metaTags}<link rel="canonical" href="${esc(opts.canonical)}"><link rel="icon" href="${esc(
    opts.favicon,
  )}"><style>${SHELL_STYLES}</style></head><body><div class="bar"><a href="/" title="SonaSky Apollo" class="home">${icon("sun")} Apollo</a><span class="title">${esc(
    opts.barTitle,
  )} <a href="${esc(`https://bsky.app/profile/${identity.did}`)}">@${esc(identity.handle ?? identity.did)}</a></span><a href="${esc(
    opts.reportHref,
  )}">Report</a></div><iframe id="apollo-site" title="${esc(
    opts.barTitle,
  )}" sandbox="allow-scripts" referrerpolicy="no-referrer" src="${esc(
    opts.frameSrc,
  )}"></iframe><script src="/_apollo/shell.js"${analyticsAttrs}></script></body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": shellCsp(
        opts.ucOrigin,
        identity.did,
        analytics ? origin(analytics.apiURL) : undefined,
      ),
      "cache-control": "public, max-age=30",
      ...SECURITY_HEADERS,
    },
  });
}

/** Resolve `rawActor`, redirecting handle URLs to their normalized form. */
async function resolveViewerActor(
  c: Ctx,
  rawActor: string,
  path: string,
): Promise<{ identity: ResolvedIdentity; actor: string } | Response> {
  let actorInput: string;
  try {
    actorInput = decodeURIComponent(rawActor).replace(/^@/, "");
  } catch {
    return notFoundPage();
  }
  const identity = await resolveActor(
    actorInput,
    c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social",
  );
  if (!identity) return notFoundPage("We couldn't find that account.");
  // DID URLs are kept as-is (they never change, even if the handle does).
  // Handle URLs are normalized to the verified, lowercased handle.
  const actor = isDid(actorInput) ? identity.did : (identity.handle ?? identity.did);
  if (actorInput !== actor) {
    const qs = new URL(c.req.url).search;
    return c.redirect(`${origin(c.env.PUBLIC_URL)}/@${actor}${path}${qs}`, 301);
  }
  return { identity, actor };
}

async function renderRingShell(c: Ctx, rawActor: string, slug: string): Promise<Response> {
  const resolved = await resolveViewerActor(c, rawActor, `/ring/${slug}`);
  if (resolved instanceof Response) return resolved;
  const { identity, actor } = resolved;
  const ucOrigin = origin(c.env.USERCONTENT_URL);

  const ring = await loadRing(c.env, identity.did, slug, identity);
  if (!ring) return notFoundPage("This ring doesn't exist.");
  const verdict = await checkModeration(c.env, identity.did, identity.pds);
  if (verdict.kind === "unavailable") return unavailablePage();

  const name = ring.entry.value.name;
  const title = `${name} · Webring`;
  const description = ring.entry.value.description ?? `A webring of Apollo sites.`;
  const canonical = ringPageUrl(c.env, actor, slug);
  const v = await version([ring.entry.cid]);
  const frameSrc = `${ucOrigin}/r/${identity.did}/ring/${slug}?${new URLSearchParams({ a: actor, v }).toString()}`;
  const reportParams = new URLSearchParams({ uri: ring.entry.uri, cid: ring.entry.cid });

  return shellResponse({
    title,
    barTitle: title,
    meta: [
      ["name", "description", description],
      ["property", "og:type", "website"],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["property", "og:url", canonical],
      ["name", "twitter:card", "summary"],
      ["name", "twitter:title", title],
      ["name", "twitter:description", description],
    ],
    canonical,
    favicon: "/sonasky_favicon.png",
    frameSrc,
    reportHref: `/report?${reportParams.toString()}`,
    identity,
    ucOrigin,
    analytics: swetrixConfig(c.env),
  });
}

/** Ring navigation: send the visitor to a member site, or back to the ring page. */
async function ringRedirect(c: Ctx, move: "prev" | "next" | "random"): Promise<Response> {
  const rawActor = c.req.param("actor") ?? "";
  const slug = c.req.param("slug") ?? "";
  if (!isSlug(slug)) return notFoundPage();
  let actorInput: string;
  try {
    actorInput = decodeURIComponent(rawActor).replace(/^@/, "");
  } catch {
    return notFoundPage();
  }
  const ring =
    isDid(actorInput) || isHandle(actorInput) ? await loadRing(c.env, actorInput, slug) : null;
  if (!ring) return notFoundPage("This ring doesn't exist.");
  const index = ringPageUrl(c.env, ring.owner.handle ?? ring.owner.did, slug);
  const roster = await ringRoster(c.env, ring);
  const target =
    move === "random"
      ? randomMember(roster, c.req.query("not"))
      : neighbor(roster, c.req.query("from"), move);
  return c.redirect(target?.url ?? index, 302);
}

viewerRoutes.get("/:actor{@[^/]+}/ring/:slug/prev", (c) => ringRedirect(c, "prev"));
viewerRoutes.get("/:actor{@[^/]+}/ring/:slug/next", (c) => ringRedirect(c, "next"));
viewerRoutes.get("/:actor{@[^/]+}/ring/:slug/random", (c) => ringRedirect(c, "random"));
viewerRoutes.get("/:actor{@[^/]+}/ring/:slug", (c) => {
  const slug = c.req.param("slug");
  if (!isSlug(slug)) return notFoundPage();
  return renderRingShell(c, c.req.param("actor"), slug);
});

viewerRoutes.get("/:actor{@[^/]+}/blog/:slug", (c) => {
  const slug = c.req.param("slug");
  if (!isSlug(slug)) return notFoundPage();
  return renderShell(c, c.req.param("actor"), { kind: "post", slug });
});

viewerRoutes.get("/:actor{@[^/]+}/blog", (c) =>
  renderShell(c, c.req.param("actor"), { kind: "blog" }),
);

viewerRoutes.get("/:actor{@[^/]+}/:slug", (c) => {
  const slug = c.req.param("slug");
  if (!isSlug(slug)) return notFoundPage();
  return renderShell(c, c.req.param("actor"), { kind: "page", slug });
});

viewerRoutes.get("/:actor{@[^/]+}", (c) => renderShell(c, c.req.param("actor"), { kind: "page" }));

/**
 * First path segments that look like files, never handles - `robots.txt` and
 * `sonasky_favicon.png` are handle-shaped but are static assets.
 */
const FILE_EXT_RE =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|json|m?js|css|map|txt|xml|webmanifest|html?|woff2?)$/i;

/**
 * `/alice.bsky.social/about` and `/profile/alice.bsky.social/about` (the
 * bsky.app / ref.sonasky.app convention) -> `/@alice.bsky.social/about`.
 * Returns null when the path isn't one of those aliases.
 */
export function viewerAliasPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  let rest: string[];
  let raw: string | undefined;
  if (parts[0] === "profile") {
    raw = parts[1];
    rest = parts.slice(2);
  } else {
    raw = parts[0];
    rest = parts.slice(1);
  }
  if (!raw) return null;
  let actor: string;
  try {
    actor = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const ok =
    isDid(actor) || (isHandle(actor) && (parts[0] === "profile" || !FILE_EXT_RE.test(actor)));
  if (!ok) return null;
  return `/@${isDid(actor) ? actor : actor.toLowerCase()}${rest.length ? `/${rest.join("/")}` : ""}`;
}

/**
 * The shell's only script. It accepts navigation requests from the site
 * iframe - and only from it - and only while the visitor is actively clicking,
 * so a site's script can't redirect visitors on its own. Every link (internal
 * or not) goes through `/out`, which decides on the server whether to warn.
 *
 * When the script tag carries Swetrix settings, it also sends one pageview,
 * shaped like the `swetrix` package's (that's what the editor SPA uses).
 */
function shellSource(): string {
  return `(function () {
  "use strict";
  var cfg = document.currentScript && document.currentScript.dataset;
  if (cfg && cfg.swetrixApi && cfg.swetrixPid && !navigator.webdriver) {
    try {
      fetch(cfg.swetrixApi.replace(/\\/?$/, "/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          pid: cfg.swetrixPid,
          pg: location.pathname,
          lc: navigator.languages ? navigator.languages[0] : navigator.language,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ref: document.referrer || undefined,
        }),
      }).catch(function () {});
    } catch (e) {}
  }
  var frame = document.getElementById("apollo-site");
  if (!frame) return;
  window.addEventListener("message", function (e) {
    // The site runs in an opaque-origin sandbox, so e.origin is always "null".
    // Identify the sender by its window instead: only this iframe is trusted.
    if (e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.type !== "apollo:navigate" || typeof d.href !== "string" || d.href.length > 4096) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    if (/^mailto:/i.test(d.href)) {
      window.location.href = d.href;
      return;
    }
    var target = "/out?url=" + encodeURIComponent(d.href);
    if (d.newTab) window.open(target, "_blank", "noopener");
    else window.location.assign(target);
  });
})();
`;
}

viewerRoutes.get("/_apollo/shell.js", () => {
  return new Response(shellSource(), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      ...SECURITY_HEADERS,
    },
  });
});

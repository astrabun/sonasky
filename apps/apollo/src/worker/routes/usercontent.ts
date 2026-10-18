/**
 * Routes for the USERCONTENT host - and nothing else is mounted there. No
 * cookies, no API, no OAuth, no SPA assets. Every HTML response carries the
 * sandboxing CSP from `render/csp.ts`.
 *
 *   GET /r/:did/page/:slug   rendered page   (iframe only)
 *   GET /r/:did/post/:slug   rendered post   (iframe only)
 *   GET /r/:did/blog         blog index      (iframe only)
 *   GET /r/:did/ring/:slug   a ring's index page (iframe only)
 *   GET /s/:did/script/:rkey.js   a script record's source
 *   GET /m/:did/:rkey        a media record's blob, re-sniffed
 *   GET /_apollo/bootstrap.js     link interceptor injected into every page
 *   GET /_apollo/block/:id.js     a community block's script (from @sonasky/apollo-blocks)
 *   GET /_apollo/fonts.css, /_apollo/font/*   Google Fonts proxy (see ../fonts.ts)
 */

import { blockScriptSource, findCommunityBlock } from "@sonasky/apollo-blocks";
import { Hono, type Context } from "hono";
import { NSID_MEDIA, NSID_SCRIPT, NSID_SITE, NSID_STYLE, SITE_RKEY } from "../../shared/nsid.ts";
import type { MediaRecord, ScriptRecord, SiteRecord, StyleRecord } from "../../shared/records.ts";
import { isSlug } from "../../shared/slug.ts";
import { isDid, isHandle, resolveActor } from "../atproto/identity.ts";
import { fetchBlob, getPublicRecord } from "../atproto/repo.ts";
import { origin, type AppEnv } from "../env.ts";
import { fetchFontFile, googleFontsCss, GSTATIC_PATH_RE, parseFamilies } from "../fonts.ts";
import { checkModeration } from "../moderation.ts";
import { SECURITY_HEADERS, usercontentCsp } from "../render/csp.ts";
import { renderRingDocument, renderSiteDocument } from "../render/document.ts";
import { loadRing, ringRoster, siteRings } from "../rings.ts";
import { jsLiteral } from "../render/escape.ts";
import { loadSite, toRenderInput, type TargetSpec } from "../site-loader.ts";
import { ALLOWED_MEDIA, peekStream, SNIFF_BYTES, sniffMime } from "../validate/media.ts";

type Ctx = Context<{ Bindings: AppEnv }>;

export const usercontentRoutes = new Hono<{ Bindings: AppEnv }>();

const DOC_TTL_SECONDS = 60;
const MEDIA_RKEY_RE = /^[a-zA-Z0-9._~:-]{1,512}$/;

function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-security-policy": "default-src 'none'; sandbox",
      ...SECURITY_HEADERS,
    },
  });
}

async function cached(c: Ctx, build: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const key = new Request(c.req.url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await build();
  if (res.status === 200) c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function renderDoc(c: Ctx, did: string, spec: TargetSpec): Promise<Response> {
  const publicOrigin = origin(c.env.PUBLIC_URL);
  const actorParam = c.req.query("a");
  // Used verbatim in viewer URLs, so it must be a well-formed handle or DID.
  const actor = actorParam && (isDid(actorParam) || isHandle(actorParam)) ? actorParam : did;

  // Only ever rendered inside the viewer shell's iframe. Anything else (a
  // pasted link, a crawler) is sent to the canonical viewer URL.
  if (c.req.header("sec-fetch-dest") !== "iframe") {
    const path =
      spec.kind === "blog"
        ? "/blog"
        : spec.kind === "post"
          ? `/blog/${spec.slug}`
          : spec.slug
            ? `/${spec.slug}`
            : "";
    return c.redirect(`${publicOrigin}/@${actor}${path}`, 302);
  }

  return cached(c, async () => {
    const identity = await resolveActor(did, c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
    if (!identity) return plain(404, "Not found");

    const loaded = await loadSite(identity.pds, did, spec);
    if (!loaded) return plain(404, "Not found");

    const verdict = await checkModeration(c.env, did, identity.pds, loaded.selfLabels);
    if (verdict.kind === "unavailable") return plain(451, "This site is unavailable.");
    if (verdict.kind === "warn" && c.req.query("cw") !== "1") {
      return plain(403, "This site has a content warning.");
    }

    const rings = await siteRings(c.env, identity.pds, did);
    const html = await renderSiteDocument(
      toRenderInput(loaded, did, actor, rings, identity.handle),
      {
        publicOrigin,
        usercontentOrigin: origin(c.env.USERCONTENT_URL),
      },
    );
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": usercontentCsp(origin(c.env.USERCONTENT_URL), publicOrigin, did),
        "cache-control": `public, max-age=${DOC_TTL_SECONDS}`,
        ...SECURITY_HEADERS,
      },
    });
  });
}

usercontentRoutes.get("/r/:did/page/:slug", (c) => {
  const { did, slug } = c.req.param();
  if (!isDid(did) || !isSlug(slug)) return plain(404, "Not found");
  return renderDoc(c, did, { kind: "page", slug });
});

usercontentRoutes.get("/r/:did/post/:slug", (c) => {
  const { did, slug } = c.req.param();
  if (!isDid(did) || !isSlug(slug)) return plain(404, "Not found");
  return renderDoc(c, did, { kind: "post", slug });
});

usercontentRoutes.get("/r/:did/blog", (c) => {
  const did = c.req.param("did");
  if (!isDid(did)) return plain(404, "Not found");
  return renderDoc(c, did, { kind: "blog" });
});

usercontentRoutes.get("/r/:did/ring/:slug", (c) => {
  const { did, slug } = c.req.param();
  if (!isDid(did) || !isSlug(slug)) return plain(404, "Not found");
  const publicOrigin = origin(c.env.PUBLIC_URL);
  const actorParam = c.req.query("a");
  const actor = actorParam && (isDid(actorParam) || isHandle(actorParam)) ? actorParam : did;
  if (c.req.header("sec-fetch-dest") !== "iframe") {
    return c.redirect(`${publicOrigin}/@${actor}/ring/${slug}`, 302);
  }

  return cached(c, async () => {
    const ring = await loadRing(c.env, did, slug);
    if (!ring) return plain(404, "Not found");
    const verdict = await checkModeration(c.env, did, ring.owner.pds);
    if (verdict.kind === "unavailable") return plain(451, "This ring is unavailable.");

    // The ring's theme, else the owner's site theme, else Apollo's defaults.
    const themeKey =
      ring.entry.value.theme ??
      (
        await getPublicRecord<SiteRecord>(ring.owner.pds, did, NSID_SITE, SITE_RKEY).catch(
          () => null,
        )
      )?.value.theme;
    const [theme, members] = await Promise.all([
      themeKey && isSlug(themeKey)
        ? getPublicRecord<StyleRecord>(ring.owner.pds, did, NSID_STYLE, themeKey).catch(() => null)
        : null,
      ringRoster(c.env, ring),
    ]);

    const html = await renderRingDocument(
      {
        ownerDid: did,
        ownerActor: actor,
        slug,
        ring: ring.entry.value,
        styles: theme?.value?.$type === NSID_STYLE ? [theme.value] : [],
        members,
      },
      { publicOrigin, usercontentOrigin: origin(c.env.USERCONTENT_URL) },
    );
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": usercontentCsp(origin(c.env.USERCONTENT_URL), publicOrigin, did),
        "cache-control": `public, max-age=${DOC_TTL_SECONDS}`,
        ...SECURITY_HEADERS,
      },
    });
  });
});

usercontentRoutes.get("/s/:did/script/:file", (c) => {
  const { did, file } = c.req.param();
  const rkey = file.endsWith(".js") ? file.slice(0, -3) : "";
  if (!isDid(did) || !isSlug(rkey)) return plain(404, "Not found");

  return cached(c, async () => {
    const identity = await resolveActor(did, c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
    if (!identity) return plain(404, "Not found");
    const verdict = await checkModeration(c.env, did, identity.pds);
    if (verdict.kind === "unavailable") return plain(451, "Unavailable");

    const entry = await getPublicRecord<ScriptRecord>(identity.pds, did, NSID_SCRIPT, rkey);
    if (!entry || typeof entry.value.js !== "string") return plain(404, "Not found");
    return new Response(entry.value.js, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": `public, max-age=${DOC_TTL_SECONDS}`,
        "cross-origin-resource-policy": "cross-origin",
        ...SECURITY_HEADERS,
      },
    });
  });
});

usercontentRoutes.get("/m/:did/:rkey", (c) => {
  const { did, rkey } = c.req.param();
  if (!isDid(did) || !MEDIA_RKEY_RE.test(rkey)) return plain(404, "Not found");

  return cached(c, async () => {
    const identity = await resolveActor(did, c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
    if (!identity) return plain(404, "Not found");
    const verdict = await checkModeration(c.env, did, identity.pds);
    if (verdict.kind === "unavailable") return plain(451, "Unavailable");

    const entry = await getPublicRecord<MediaRecord>(identity.pds, did, NSID_MEDIA, rkey);
    const cid = entry?.value.file?.ref?.$link;
    if (!entry || typeof cid !== "string") return plain(404, "Not found");

    const blob = await fetchBlob(identity.pds, did, cid);
    if (!blob.ok || !blob.body) return plain(404, "Not found");

    // Records can be written by any client, so re-check the actual bytes here.
    const { head, stream } = await peekStream(blob.body, SNIFF_BYTES);
    const mime = sniffMime(head);
    if (!mime) {
      await stream.cancel();
      return plain(415, "Unsupported media type");
    }
    const length = Number(blob.headers.get("content-length") ?? entry.value.file.size ?? 0);
    if (length > ALLOWED_MEDIA[mime]) {
      await stream.cancel();
      return plain(413, "Too large");
    }

    return new Response(stream, {
      headers: {
        "content-type": mime,
        "content-disposition": "inline",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": "public, max-age=3600",
        "cross-origin-resource-policy": "cross-origin",
        ...(blob.headers.get("content-length")
          ? { "content-length": blob.headers.get("content-length") as string }
          : {}),
        ...SECURITY_HEADERS,
      },
    });
  });
});

/**
 * Injected first into every page. Link clicks are handed to the viewer shell
 * (the parent frame), which routes them through `/out` - the sandbox gives the
 * page no way to navigate anywhere itself. Same-page `#anchors` stay local.
 */
function bootstrapSource(publicOrigin: string): string {
  return `(function () {
  "use strict";
  var PARENT = ${jsLiteral(publicOrigin)};
  function linkFor(el) {
    while (el && el.nodeType === 1) {
      if (el.tagName === "A" && el.hasAttribute("href")) return el;
      el = el.parentNode;
    }
    return null;
  }
  function handle(e, newTab) {
    if (e.defaultPrevented) return;
    var a = linkFor(e.target);
    if (!a) return;
    if ((a.getAttribute("href") || "").charAt(0) === "#") return;
    e.preventDefault();
    window.parent.postMessage({ type: "apollo:navigate", href: a.href, newTab: !!newTab }, PARENT);
  }
  window.addEventListener("click", function (e) {
    if (e.button === 0) handle(e, e.ctrlKey || e.metaKey || e.shiftKey);
  });
  window.addEventListener("auxclick", function (e) {
    if (e.button === 1) handle(e, true);
  });
})();
`;
}

// Reviewed code shipped with Apollo, not user data: the same file for every
// site. Pages link it with `?v=<content hash>`, so it can be cached for long.
usercontentRoutes.get("/_apollo/block/:file", (c) => {
  const file = c.req.param("file");
  const def = file.endsWith(".js") ? findCommunityBlock(file.slice(0, -3)) : undefined;
  const js = def ? blockScriptSource(def) : "";
  if (!js) return plain(404, "Not found");
  return new Response(js, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "cross-origin-resource-policy": "cross-origin",
      ...SECURITY_HEADERS,
    },
  });
});

usercontentRoutes.get("/_apollo/fonts.css", (c) => {
  const families = parseFamilies(c.req.queries("family") ?? []);
  if (!families) return plain(400, "Bad font request");
  return cached(c, async () => {
    const css = await googleFontsCss(families, origin(c.env.USERCONTENT_URL));
    return new Response(css, {
      headers: {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "public, max-age=86400",
        "cross-origin-resource-policy": "cross-origin",
        ...SECURITY_HEADERS,
      },
    });
  });
});

usercontentRoutes.get("/_apollo/font/*", (c) => {
  const path = c.req.path.slice("/_apollo/font/".length);
  if (!GSTATIC_PATH_RE.test(path)) return plain(404, "Not found");
  return cached(c, async () => (await fetchFontFile(path)) ?? plain(404, "Not found"));
});

usercontentRoutes.get("/_apollo/bootstrap.js", (c) => {
  return new Response(bootstrapSource(origin(c.env.PUBLIC_URL)), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "cross-origin-resource-policy": "cross-origin",
      ...SECURITY_HEADERS,
    },
  });
});

// Nothing lives at the root of the usercontent host; send people to the editor.
// (Locally this also catches opening http://localhost:8787 instead of 127.0.0.1.)
usercontentRoutes.get("/", (c) => c.redirect(`${origin(c.env.PUBLIC_URL)}/`, 302));

usercontentRoutes.all("*", () => plain(404, "Not found"));

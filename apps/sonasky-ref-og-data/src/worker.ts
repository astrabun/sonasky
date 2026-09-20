import { lookupCharacter } from "./lookupCharacter";
import { rewriteMeta } from "./rewriteMeta";

// Matches the character page route only: /profile/:blueskyHandleOrDID/:rkey
// (the gallery view at /profile/:handle and the legacy /post/:postId redirect
// have exactly one segment after /profile/ and pass through unmodified).
const CHARACTER_PATH = /^\/profile\/([^/]+)\/([^/]+)\/?$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const originUrl = new URL(url.pathname + url.search, `https://${env.ORIGIN_HOST}`);
    const originRequest = new Request(originUrl, request);

    const match = CHARACTER_PATH.exec(url.pathname);
    if (!match) {
      return fetch(originRequest);
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const originResponse = await fetch(originRequest);
    if (!originResponse.ok || !originResponse.headers.get("content-type")?.includes("text/html")) {
      return originResponse;
    }

    const [, handleOrDid, rkey] = match;
    const useAlt = url.searchParams.get("alt") === "true";
    let meta = null;
    try {
      meta = await lookupCharacter(
        decodeURIComponent(handleOrDid),
        decodeURIComponent(rkey),
        env.HANDLE_RESOLVER_URL,
        useAlt,
      );
    } catch (err) {
      console.error("sonasky-ref-og-data: character lookup failed", err);
    }

    const rewritten = meta ? rewriteMeta(originResponse, meta, url.toString()) : originResponse;
    const response = new Response(rewritten.body, rewritten);
    response.headers.set("Cache-Control", "public, max-age=300");
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
} satisfies ExportedHandler<Env>;

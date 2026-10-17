/**
 * workerd's `fetch` rejects `redirect: "error"` (only "follow" / "manual" are
 * supported at the edge). Several `@atproto-labs` resolvers hard-code
 * `redirect: "error"` on their requests, so we hand the OAuth client a `fetch`
 * that rewrites it to "manual" - a 3xx then surfaces downstream as `!res.ok`,
 * which is the same "treat a redirect as failure" intent.
 */
export const edgeFetch: typeof globalThis.fetch = (input, init) => {
  let target: RequestInfo | URL = input;
  let opts = init;

  if (input instanceof Request && input.redirect === "error") {
    target = new Request(input, { redirect: "manual" });
  }
  if (opts?.redirect === "error") {
    opts = { ...opts, redirect: "manual" };
  }

  return globalThis.fetch(target, opts);
};

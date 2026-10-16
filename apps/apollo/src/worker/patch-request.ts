/**
 * workerd's `Request`/`fetch` reject `redirect: "error"` (only "follow" /
 * "manual" exist at the edge). Several `@atproto-labs` packages construct
 * `new Request(url, { redirect: "error" })` deep inside their resolvers, before
 * any injected `fetch` runs - so the only place to intervene is the `Request`
 * constructor itself. Coerce "error" -> "manual"; downstream code already treats
 * a 3xx as failure via `!res.ok`, which matches the intent of "error".
 *
 * Imported for its side effect as the very first thing in the Worker entry.
 */

const OriginalRequest = globalThis.Request;

function coerce(init?: RequestInit): RequestInit | undefined {
  if (init && init.redirect === "error") return { ...init, redirect: "manual" };
  return init;
}

const PatchedRequest = new Proxy(OriginalRequest, {
  construct(target, args: [RequestInfo | URL, RequestInit?], newTarget) {
    const [input, init] = args;
    let nextInit = coerce(init);
    if (
      nextInit === init &&
      !init &&
      input instanceof OriginalRequest &&
      input.redirect === "error"
    ) {
      nextInit = { redirect: "manual" };
    }
    return Reflect.construct(target, [input, nextInit], newTarget);
  },
});

try {
  globalThis.Request = PatchedRequest;
} catch {
  try {
    Object.defineProperty(globalThis, "Request", {
      value: PatchedRequest,
      writable: true,
      configurable: true,
    });
  } catch {
    // If the runtime forbids replacing Request, `edgeFetch` still covers the
    // paths where an injected fetch is honoured.
  }
}

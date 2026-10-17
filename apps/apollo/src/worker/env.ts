/**
 * Hand-written binding/secret contract for the Worker. This is the source of
 * truth the code imports; `worker-configuration.d.ts` (from `wrangler types`)
 * covers the `wrangler.jsonc` bindings and vars.
 *
 * Secrets (`COOKIE_SECRET`, `OAUTH_PRIVATE_KEY`) are set with
 * `wrangler secret put` / `.dev.vars` and are not in `wrangler.jsonc`.
 */
export interface AppEnv {
  /** Static assets binding (the Vite `dist/client` build). */
  ASSETS: Fetcher;

  /** Short-lived OAuth state: PKCE verifier, nonce, DPoP key JWK. ~10 min TTL. */
  APOLLO_OAUTH_STATE: KVNamespace;
  /** Per-DID OAuth session: token set + DPoP key JWK. */
  APOLLO_OAUTH_SESSION: KVNamespace;
  /** Admin data. `block:<did>` -> reason blocks a DID from viewing and writing. */
  APOLLO_ADMIN: KVNamespace;

  /** Per-DID write budget for `/api/*` mutations. */
  WRITE_LIMITER: RateLimit;

  /** Editor origin, e.g. `https://apollo.sonasky.app`. */
  PUBLIC_URL: string;
  /** Origin rendered user sites are served from - a different registrable domain. */
  USERCONTENT_URL: string;
  /** Handle/PDS resolver used during sign-in. Defaults to `https://bsky.social`. */
  HANDLE_RESOLVER_URL?: string;

  /** Apollo's Swetrix pageview endpoint, including `/log`. Viewer analytics is off when unset. */
  APOLLO_SWETRIX_API_URL?: string;
  /** Apollo's Swetrix project id. Viewer analytics is off when unset. */
  APOLLO_SWETRIX_PROJECT_ID?: string;

  /** HMAC key for the session cookie. */
  COOKIE_SECRET: string;
  /** Confidential-client signing key (ES256): PKCS8 PEM or JWK JSON string. */
  OAUTH_PRIVATE_KEY?: string;
}

/** Origin without a trailing slash. */
export function origin(value: string): string {
  return new URL(value).origin;
}

export interface SwetrixConfig {
  apiURL: string;
  projectId: string;
}

/** Swetrix settings for the viewer shell, or null when unset or the URL isn't https. */
export function swetrixConfig(env: AppEnv): SwetrixConfig | null {
  const apiURL = env.APOLLO_SWETRIX_API_URL;
  const projectId = env.APOLLO_SWETRIX_PROJECT_ID;
  if (!apiURL || !projectId) return null;
  try {
    if (new URL(apiURL).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { apiURL, projectId };
}

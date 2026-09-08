/**
 * Hand-written binding/secret contract for the Worker. This is the source of
 * truth the code imports; `worker-configuration.d.ts` (from `wrangler types`)
 * covers the `wrangler.jsonc` bindings and vars.
 *
 * Secrets (`COOKIE_SECRET`, `OAUTH_PRIVATE_KEY`, `GFORM_*`) are set with
 * `wrangler secret put` / `.dev.vars` and are not in `wrangler.jsonc`.
 */
export interface AppEnv {
  /** Static assets binding (the Vite `dist/client` build). */
  ASSETS: Fetcher;

  /** Short-lived OAuth state: PKCE verifier, nonce, DPoP key JWK. ~10 min TTL. */
  SSKYFORM_OAUTH_STATE: KVNamespace;
  /** Per-DID OAuth session: token set + DPoP key JWK. */
  SSKYFORM_OAUTH_SESSION: KVNamespace;

  /** Public origin the Worker is served from, e.g. `https://forms.sonasky.app`. */
  PUBLIC_URL: string;
  /** Handle/PDS resolver used during sign-in. Defaults to `https://bsky.social`. */
  HANDLE_RESOLVER_URL?: string;

  /** HMAC key for the session cookie. */
  COOKIE_SECRET: string;
  /** Confidential-client signing key (ES256): PKCS8 PEM or JWK JSON string. */
  OAUTH_PRIVATE_KEY?: string;

  /** Per-form Google Form ids, keyed by the name in `destination.formIdEnvVar`. */
  [gform: `GFORM_${string}`]: string | undefined;
}

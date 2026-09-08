/**
 * Server-side AT Proto OAuth for Cloudflare Workers.
 *
 * Built on the framework-agnostic `@atproto/oauth-client` core (NOT
 * `@atproto/oauth-client-node`, which pulls in `node:dns` / `fetch-node`). All
 * crypto goes through WebCrypto via `WebcryptoKey`, and both stores are KV.
 *
 * Two client shapes:
 *  - production (`PUBLIC_URL` is https): a discoverable client whose metadata is
 *    served at `${PUBLIC_URL}/client-metadata.json`; confidential when
 *    `OAUTH_PRIVATE_KEY` is set (adds `/jwks.json` + `private_key_jwt`).
 *  - local dev (`PUBLIC_URL` host is localhost/127.0.0.1): an atproto "loopback"
 *    client - no hosted metadata, `client_id` is `http://localhost`, redirect is
 *    `http://127.0.0.1:<port>/oauth/callback`. Works against bsky.social with no
 *    tunnel; access the app via `http://127.0.0.1:<port>` (not `localhost`).
 */

import { JoseKey } from "@atproto/jwk-jose";
import { WebcryptoKey } from "@atproto/jwk-webcrypto";
import {
  OAuthClient,
  type Key,
  type OAuthClientOptions,
  type RuntimeImplementation,
} from "@atproto/oauth-client";
import { buildAtprotoLoopbackClientMetadata } from "@atproto/oauth-types";
import type { AppEnv } from "../env.ts";
import { edgeFetch } from "./fetch.ts";
import { makeSessionStore, makeStateStore } from "./kv-store.ts";

const OAUTH_SCOPE = "atproto transition:generic";
const SIGNING_ALG = "ES256";

/**
 * Load the confidential-client signing key. Accepts an ES256 (P-256) key as
 * either a PKCS#8 PEM or a JWK JSON string. `JoseKey.fromImportable` can't be
 * used for the PEM path on Workers - it calls `importPKCS8` with an empty `alg`,
 * which throws on WebCrypto - so pass the alg explicitly.
 */
async function loadSigningKey(raw: string): Promise<Key> {
  const value = raw.trim();
  if (value.startsWith("-----")) {
    return JoseKey.fromPKCS8(value, SIGNING_ALG, "forms-oauth-1");
  }
  return JoseKey.fromImportable(value, "forms-oauth-1"); // JWK JSON string
}

const SUBTLE_DIGEST: Record<"sha256" | "sha384" | "sha512", string> = {
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
};

const runtimeImplementation: RuntimeImplementation = {
  createKey: (algs: string[]): Promise<Key> =>
    WebcryptoKey.generate(algs, undefined, { extractable: true }),
  getRandomValues: (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length)),
  digest: async (
    data: Uint8Array,
    alg: { name: "sha256" | "sha384" | "sha512" },
  ): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.digest(SUBTLE_DIGEST[alg.name], data)),
};

function publicUrl(env: AppEnv): URL {
  return new URL(env.PUBLIC_URL.replace(/\/+$/, "") + "/");
}

function isLoopback(env: AppEnv): boolean {
  const host = publicUrl(env).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function isConfidential(env: AppEnv): boolean {
  return !isLoopback(env) && Boolean(env.OAUTH_PRIVATE_KEY && env.OAUTH_PRIVATE_KEY.trim());
}

export function clientMetadata(env: AppEnv): OAuthClientOptions["clientMetadata"] {
  if (isLoopback(env)) {
    const url = publicUrl(env);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return buildAtprotoLoopbackClientMetadata({
      scope: OAUTH_SCOPE,
      redirect_uris: [`http://127.0.0.1:${port}/oauth/callback`],
    });
  }

  const base = env.PUBLIC_URL.replace(/\/+$/, "");
  const confidential = isConfidential(env);
  return {
    client_id: `${base}/client-metadata.json`,
    client_name: "SonaSky Forms",
    client_uri: base,
    redirect_uris: [`${base}/oauth/callback`],
    scope: OAUTH_SCOPE,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    dpop_bound_access_tokens: true,
    token_endpoint_auth_method: confidential ? "private_key_jwt" : "none",
    ...(confidential
      ? { jwks_uri: `${base}/jwks.json`, token_endpoint_auth_signing_alg: "ES256" }
      : {}),
  };
}

let cached: { key: string; client: OAuthClient } | undefined;

export async function getOAuthClient(env: AppEnv): Promise<OAuthClient> {
  const cacheKey = `${env.PUBLIC_URL}|${isConfidential(env) ? "c" : "p"}`;
  if (cached && cached.key === cacheKey) return cached.client;

  const keyset = isConfidential(env)
    ? [await loadSigningKey(env.OAUTH_PRIVATE_KEY as string)]
    : undefined;

  const client = new OAuthClient({
    clientMetadata: clientMetadata(env),
    keyset,
    responseMode: "query",
    handleResolver: env.HANDLE_RESOLVER_URL ?? "https://bsky.social",
    allowHttp: publicUrl(env).protocol === "http:",
    fetch: edgeFetch,
    stateStore: makeStateStore(env.SSKYFORM_OAUTH_STATE),
    sessionStore: makeSessionStore(env.SSKYFORM_OAUTH_SESSION),
    runtimeImplementation,
  });

  cached = { key: cacheKey, client };
  return client;
}

export { OAUTH_SCOPE };

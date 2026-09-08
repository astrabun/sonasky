/**
 * KV-backed implementations of the `@atproto/oauth-client` `StateStore` and
 * `SessionStore`. Both hold a DPoP `Key`; we persist it as its private JWK and
 * rebuild a `WebcryptoKey` on read (WebCrypto is available on workerd).
 */

import { JoseKey } from "@atproto/jwk-jose";
import type { Key } from "@atproto/jwk";
import type { InternalStateData, Session, SessionStore, StateStore } from "@atproto/oauth-client";

/** Seconds an in-flight authorization request may sit in KV before expiring. */
const STATE_TTL_SECONDS = 600;

type StoredState = Omit<InternalStateData, "dpopKey"> & { dpopJwk: unknown };
type StoredSession = Omit<Session, "dpopKey"> & { dpopJwk: unknown };

async function keyToJwk(key: Key): Promise<unknown> {
  const jwk = key.privateJwk;
  if (!jwk) throw new Error("DPoP key has no private JWK (was it generated non-extractable?)");
  return jwk;
}

async function jwkToKey(jwk: unknown): Promise<Key> {
  return JoseKey.fromJWK(jwk as Record<string, unknown>);
}

export function makeStateStore(kv: KVNamespace): StateStore {
  return {
    async set(key: string, value: InternalStateData): Promise<void> {
      const { dpopKey, ...rest } = value;
      const stored: StoredState = { ...rest, dpopJwk: await keyToJwk(dpopKey) };
      await kv.put(key, JSON.stringify(stored), { expirationTtl: STATE_TTL_SECONDS });
    },
    async get(key: string): Promise<InternalStateData | undefined> {
      const raw = await kv.get(key);
      if (!raw) return undefined;
      const { dpopJwk, ...rest } = JSON.parse(raw) as StoredState;
      return { ...(rest as Omit<InternalStateData, "dpopKey">), dpopKey: await jwkToKey(dpopJwk) };
    },
    async del(key: string): Promise<void> {
      await kv.delete(key);
    },
  };
}

export function makeSessionStore(kv: KVNamespace): SessionStore {
  return {
    async set(sub: string, value: Session): Promise<void> {
      const { dpopKey, ...rest } = value;
      const stored: StoredSession = { ...rest, dpopJwk: await keyToJwk(dpopKey) };
      await kv.put(`did:${sub}`, JSON.stringify(stored));
    },
    async get(sub: string): Promise<Session | undefined> {
      const raw = await kv.get(`did:${sub}`);
      if (!raw) return undefined;
      const { dpopJwk, ...rest } = JSON.parse(raw) as StoredSession;
      return { ...(rest as Omit<Session, "dpopKey">), dpopKey: await jwkToKey(dpopJwk) };
    },
    async del(sub: string): Promise<void> {
      await kv.delete(`did:${sub}`);
    },
  };
}

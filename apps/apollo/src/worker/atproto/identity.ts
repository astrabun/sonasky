/**
 * Server-side identity resolution for the public viewer: handle -> DID -> DID
 * document -> PDS. Adapted from apps/sonasky-ref-og-data/src/atproto/
 * {handleResolver,getPds}.ts, plus bi-directional verification: a handle is only
 * accepted when the DID document it resolves to claims it back (`alsoKnownAs`),
 * so nobody can point their domain at someone else's site.
 */

const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+(%3A[0-9]+)?)$/;
const HANDLE_RE =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export interface DidDocument {
  id?: string;
  alsoKnownAs?: string[];
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

export interface ResolvedIdentity {
  did: string;
  /** Verified handle, when the DID document claims one that resolves back. */
  handle?: string;
  pds: string;
}

export function isDid(value: string): boolean {
  return DID_RE.test(value);
}

export function isHandle(value: string): boolean {
  return value.length <= 253 && HANDLE_RE.test(value);
}

const TTL_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; value: ResolvedIdentity | null }>();

function didDocUrl(did: string): string {
  return did.startsWith("did:web:")
    ? `https://${decodeURIComponent(did.slice("did:web:".length))}/.well-known/did.json`
    : `https://plc.directory/${did}`;
}

export async function fetchDidDoc(did: string): Promise<DidDocument | null> {
  try {
    const res = await fetch(didDocUrl(did), { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const doc = (await res.json()) as DidDocument;
    return doc.id === did ? doc : null;
  } catch {
    return null;
  }
}

function pdsFromDoc(doc: DidDocument): string | undefined {
  const svc = doc.service?.find(
    (s) => s.type === "AtprotoPersonalDataServer" || s.id === "#atproto_pds",
  );
  if (!svc) return undefined;
  try {
    const url = new URL(svc.serviceEndpoint);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function handleFromDoc(doc: DidDocument): string | undefined {
  const aka = doc.alsoKnownAs?.find((v) => v.startsWith("at://"));
  return aka ? aka.slice("at://".length).toLowerCase() : undefined;
}

/** Handle -> DID via DNS-over-HTTPS TXT, well-known, then the resolver XRPC. */
async function resolveHandleToDid(handle: string, resolverUrl: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=_atproto.${encodeURIComponent(handle)}&type=TXT`,
      { headers: { accept: "application/dns-json" } },
    );
    if (res.ok) {
      const body = (await res.json()) as { Answer?: { data: string }[] };
      for (const answer of body.Answer ?? []) {
        const txt = answer.data.replace(/^"|"$/g, "");
        if (txt.startsWith("did=") && isDid(txt.slice(4))) return txt.slice(4);
      }
    }
  } catch {
    // fall through
  }

  try {
    const res = await fetch(`https://${handle}/.well-known/atproto-did`);
    if (res.ok) {
      const did = (await res.text()).trim();
      if (isDid(did)) return did;
    }
  } catch {
    // fall through
  }

  try {
    const url = new URL("/xrpc/com.atproto.identity.resolveHandle", resolverUrl);
    url.searchParams.set("handle", handle);
    const res = await fetch(url);
    if (res.ok) {
      const { did } = (await res.json()) as { did?: string };
      if (did && isDid(did)) return did;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Resolve a viewer URL's actor segment (a handle or a DID). Returns null when it
 * doesn't resolve, the handle isn't confirmed by the DID document, or the DID
 * has no https PDS.
 */
export async function resolveActor(
  actor: string,
  resolverUrl: string,
): Promise<ResolvedIdentity | null> {
  const key = actor.toLowerCase();
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: ResolvedIdentity | null = null;
  if (isDid(actor)) {
    const doc = await fetchDidDoc(actor);
    const pds = doc && pdsFromDoc(doc);
    if (doc && pds) {
      const claimed = handleFromDoc(doc);
      const verified =
        claimed && isHandle(claimed) && (await resolveHandleToDid(claimed, resolverUrl)) === actor;
      value = { did: actor, pds, ...(verified ? { handle: claimed } : {}) };
    }
  } else if (isHandle(key)) {
    const did = await resolveHandleToDid(key, resolverUrl);
    const doc = did ? await fetchDidDoc(did) : null;
    const pds = doc && pdsFromDoc(doc);
    const claims = doc?.alsoKnownAs?.some((v) => v.toLowerCase() === `at://${key}`);
    if (did && doc && pds && claims) {
      value = { did, handle: key, pds };
    }
  }

  memo.set(key, { at: Date.now(), value });
  return value;
}

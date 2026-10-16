/**
 * Unauthenticated reads straight from a user's PDS (records are public). Used by
 * the viewer and the usercontent renderer; the editor API goes through the
 * OAuth `Agent` instead.
 */

export interface RecordEntry<T> {
  uri: string;
  cid: string;
  rkey: string;
  value: T;
}

function xrpc(pds: string, method: string, params: Record<string, string>): URL {
  const url = new URL(`/xrpc/${method}`, pds);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

/** One record, or null when it doesn't exist. Throws on other failures. */
export async function getPublicRecord<T>(
  pds: string,
  did: string,
  collection: string,
  rkey: string,
): Promise<RecordEntry<T> | null> {
  const res = await fetch(xrpc(pds, "com.atproto.repo.getRecord", { repo: did, collection, rkey }));
  if (res.status === 400 || res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "RecordNotFound" || res.status === 404) return null;
    throw new Error(`getRecord ${collection}/${rkey}: ${body.error ?? res.status}`);
  }
  if (!res.ok) throw new Error(`getRecord ${collection}/${rkey}: ${res.status}`);
  const body = (await res.json()) as { uri: string; cid?: string; value: T };
  return { uri: body.uri, cid: body.cid ?? "", rkey: rkeyOf(body.uri), value: body.value };
}

/** Every record in a collection, up to `max`. */
export async function listPublicRecords<T>(
  pds: string,
  did: string,
  collection: string,
  max = 500,
): Promise<RecordEntry<T>[]> {
  const out: RecordEntry<T>[] = [];
  let cursor: string | undefined;
  do {
    const params: Record<string, string> = { repo: did, collection, limit: "100" };
    if (cursor) params.cursor = cursor;
    const res = await fetch(xrpc(pds, "com.atproto.repo.listRecords", params));
    if (!res.ok) throw new Error(`listRecords ${collection}: ${res.status}`);
    const body = (await res.json()) as {
      cursor?: string;
      records: { uri: string; cid: string; value: T }[];
    };
    for (const r of body.records) out.push({ ...r, rkey: rkeyOf(r.uri) });
    cursor = body.records.length > 0 ? body.cursor : undefined;
  } while (cursor && out.length < max);
  return out.slice(0, max);
}

export interface RepoStatus {
  active: boolean;
  /** e.g. "takendown", "suspended", "deactivated" when not active. */
  status?: string;
}

export async function getRepoStatus(pds: string, did: string): Promise<RepoStatus> {
  const res = await fetch(xrpc(pds, "com.atproto.sync.getRepoStatus", { did }));
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // RepoTakendown / RepoDeactivated / RepoNotFound all mean "don't serve".
    return { active: false, status: body.error ?? `http_${res.status}` };
  }
  return (await res.json()) as RepoStatus;
}

/** Fetch a blob's bytes from the PDS. */
export function fetchBlob(pds: string, did: string, cid: string): Promise<Response> {
  return fetch(xrpc(pds, "com.atproto.sync.getBlob", { did, cid }));
}

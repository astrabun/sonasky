/**
 * Turn the Bluesky links people actually copy (bsky.app URLs) into the
 * identifiers blocks store (at:// URIs / DIDs), so nobody has to know what an
 * at:// URI is.
 */

const APPVIEW = "https://public.api.bsky.app";
const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+(%3A[0-9]+)?)$/;

async function resolveActorDid(actor: string): Promise<string> {
  if (DID_RE.test(actor)) return actor;
  const url = new URL("/xrpc/com.atproto.identity.resolveHandle", APPVIEW);
  url.searchParams.set("handle", actor.replace(/^@/, ""));
  const res = await fetch(url);
  if (!res.ok) throw new Error("We couldn't find that Bluesky account.");
  const { did } = (await res.json()) as { did?: string };
  if (!did) throw new Error("We couldn't find that Bluesky account.");
  return did;
}

function parseBskyUrl(input: string): string[] | null {
  const value = input.trim();
  if (value.startsWith("at://")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== "bsky.app" && url.hostname !== "staging.bsky.app") return null;
  return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

/** `https://bsky.app/profile/x/post/abc` (or an at:// URI) -> `at://did/app.bsky.feed.post/abc`. */
export async function postUriFrom(input: string): Promise<string> {
  const v = input.trim();
  if (/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(v)) return v;
  const parts = parseBskyUrl(v);
  if (parts && parts[0] === "profile" && parts[2] === "post" && parts[3]) {
    return `at://${await resolveActorDid(parts[1])}/app.bsky.feed.post/${parts[3]}`;
  }
  throw new Error("Paste the link to a Bluesky post (open the post, then Share &rarr; Copy link).");
}

/** `https://bsky.app/profile/x` (or a handle / DID) -> DID. */
export async function profileDidFrom(input: string): Promise<string> {
  const v = input.trim().replace(/^@/, "");
  if (DID_RE.test(v)) return v;
  const parts = parseBskyUrl(v);
  if (parts && parts[0] === "profile" && parts[1]) return resolveActorDid(parts[1]);
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)) return resolveActorDid(v);
  throw new Error("Paste a Bluesky profile link or handle, like alice.bsky.social.");
}

/** `https://bsky.app/starter-pack/x/abc` -> `at://did/app.bsky.graph.starterpack/abc`. */
export async function starterPackUriFrom(input: string): Promise<string> {
  const v = input.trim();
  if (/^at:\/\/[^/]+\/app\.bsky\.graph\.starterpack\/[^/]+$/.test(v)) return v;
  const parts = parseBskyUrl(v);
  if (parts && parts[0] === "starter-pack" && parts[1] && parts[2]) {
    return `at://${await resolveActorDid(parts[1])}/app.bsky.graph.starterpack/${parts[2]}`;
  }
  throw new Error("Paste the link to a Bluesky starter pack.");
}

/** at:// post URI -> a bsky.app URL for showing in the editor. */
export function bskyUrlForUri(uri: string): string {
  const m = /^at:\/\/([^/]+)\/(app\.bsky\.feed\.post|app\.bsky\.graph\.starterpack)\/([^/]+)$/.exec(
    uri,
  );
  if (!m) return uri;
  return m[2] === "app.bsky.feed.post"
    ? `https://bsky.app/profile/${m[1]}/post/${m[3]}`
    : `https://bsky.app/starter-pack/${m[1]}/${m[3]}`;
}

export interface LabelerSummary {
  did: string;
  handle: string;
  name: string;
}

/** Labeler accounts' names, for showing chosen labelers in the editor. Missing ones are left out. */
export async function labelerSummaries(dids: string[]): Promise<LabelerSummary[]> {
  if (dids.length === 0) return [];
  const url = new URL("/xrpc/app.bsky.labeler.getServices", APPVIEW);
  for (const did of dids) url.searchParams.append("dids", did);
  const res = await fetch(url);
  if (!res.ok) return [];
  const { views } = (await res.json()) as {
    views?: { creator: { did: string; handle: string; displayName?: string } }[];
  };
  return (views ?? []).map(({ creator }) => ({
    did: creator.did,
    handle: creator.handle,
    name: creator.displayName || creator.handle,
  }));
}

/** A labeler's profile link, handle or DID -> DID, checking the account really runs a labeler. */
export async function labelerDidFrom(input: string): Promise<string> {
  const did = await profileDidFrom(input);
  const [found] = await labelerSummaries([did]);
  if (!found) throw new Error("That account isn't a labeler.");
  return did;
}

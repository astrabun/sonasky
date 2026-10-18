/**
 * Static Bluesky cards for the bskyPost / bskyProfile / starterPack blocks, and
 * reply threads for Bluesky comments.
 * Data comes from the public AppView at render time - no third-party iframes or
 * scripts in the page. Content Bluesky has labeled as adult/graphic is not
 * reproduced; the card just links out.
 */

import { WARN_LABELS } from "../moderation.ts";

const APPVIEW = "https://public.api.bsky.app";
const CONSTELLATION = "https://constellation.microcosm.blue";
const HIDE = new Set(["!hide", "!takedown", "!warn"]);

interface Label {
  val: string;
  neg?: boolean;
}

interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  labels?: Label[];
}

export interface PostCard {
  url: string;
  author: ProfileView;
  text: string;
  createdAt?: string;
  hidden: boolean;
}

export interface ProfileCard {
  url: string;
  profile: ProfileView;
  hidden: boolean;
}

export interface StarterPackCard {
  url: string;
  name: string;
  description?: string;
  creator: ProfileView;
  memberCount?: number;
  hidden: boolean;
}

/** atproto record key timestamp: 13 base32-sortable characters. */
const TID_RE = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;
const TID_CHARS = "234567abcdefghijklmnopqrstuvwxyz";

/**
 * A TID's timestamp, as an ISO time. The last 2 chars (10 bits) are the clock
 * id; the first 11 are microseconds since the epoch.
 */
export function tidTime(tid: string): string {
  let micros = 0;
  for (const ch of tid.slice(0, 11)) micros = micros * 32 + TID_CHARS.indexOf(ch);
  return new Date(Math.floor(micros / 1000)).toISOString();
}

function flagged(labels: Label[] | undefined): boolean {
  return (labels ?? []).some((l) => !l.neg && (WARN_LABELS.has(l.val) || HIDE.has(l.val)));
}

/** Only Bluesky's own CDN is allowed by the usercontent CSP. */
export function safeAvatar(url: string | undefined): string | undefined {
  return url && url.startsWith("https://cdn.bsky.app/") ? url : undefined;
}

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/([a-zA-Z0-9.]+)\/([a-zA-Z0-9._~:-]+)$/.exec(
    uri,
  );
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

async function appview<T>(method: string, params: [string, string][]): Promise<T | null> {
  const url = new URL(`/xrpc/${method}`, APPVIEW);
  for (const [k, v] of params) url.searchParams.append(k, v);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchPostCards(uris: string[]): Promise<Map<string, PostCard>> {
  const out = new Map<string, PostCard>();
  const valid = uris.filter((u) => parseAtUri(u)?.collection === "app.bsky.feed.post");
  for (let i = 0; i < valid.length; i += 25) {
    const batch = valid.slice(i, i + 25);
    const res = await appview<{
      posts: {
        uri: string;
        author: ProfileView;
        record: { text?: string; createdAt?: string };
        labels?: Label[];
      }[];
    }>(
      "app.bsky.feed.getPosts",
      batch.map((u) => ["uris", u]),
    );
    for (const post of res?.posts ?? []) {
      const parts = parseAtUri(post.uri);
      if (!parts) continue;
      out.set(post.uri, {
        url: `https://bsky.app/profile/${post.author.did}/post/${parts.rkey}`,
        author: post.author,
        text: post.record.text ?? "",
        createdAt: post.record.createdAt,
        hidden: flagged(post.labels) || flagged(post.author.labels),
      });
    }
  }
  return out;
}

/** One reply shown as a comment, with the replies to it. Text is plain. */
export interface Comment {
  url: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    /** Always a cdn.bsky.app address when set. */
    avatar?: string;
    url: string;
  };
  text: string;
  createdAt: string;
  likeCount: number;
  /** The reply is by whoever wrote the post. */
  byPostAuthor: boolean;
  replies: Comment[];
}

export interface CommentThread {
  postUrl: string;
  replyCount: number;
  comments: Comment[];
}

interface ThreadNode {
  $type?: string;
  post?: {
    uri: string;
    author: ProfileView;
    record: { text?: string; createdAt?: string };
    indexedAt?: string;
    labels?: Label[];
    likeCount?: number;
    replyCount?: number;
    threadgate?: Threadgate;
  };
  replies?: ThreadNode[];
}

interface Threadgate {
  record?: { hiddenReplies?: unknown };
}

const THREAD_VIEW = "app.bsky.feed.defs#threadViewPost";

/**
 * Replies to a post, as a tree of comments. Left out, along with the replies
 * under them: replies the post's author hid (threadgate), deleted or blocked
 * posts, and replies labeled (or by accounts labeled) as adult, graphic or
 * hidden. `limit` is filled breadth-first, so one long side thread can't push
 * out other top-level replies.
 */
export async function fetchComments(
  uri: string,
  opts: { depth: number; limit: number },
): Promise<CommentThread | null> {
  const parts = parseAtUri(uri);
  if (!parts || parts.collection !== "app.bsky.feed.post") return null;
  const res = await appview<{ thread?: ThreadNode; threadgate?: Threadgate }>(
    "app.bsky.feed.getPostThread",
    [
      ["uri", uri],
      ["depth", String(opts.depth)],
      ["parentHeight", "0"],
    ],
  );
  const root = res?.thread;
  if (!root?.post || (root.$type && root.$type !== THREAD_VIEW)) return null;
  const hiddenList = (res?.threadgate ?? root.post.threadgate)?.record?.hiddenReplies;
  const hidden = new Set(Array.isArray(hiddenList) ? hiddenList : []);
  const rootAuthor = root.post.author.did;

  const visible = (n: ThreadNode): boolean =>
    Boolean(n.post) &&
    (!n.$type || n.$type === THREAD_VIEW) &&
    !hidden.has(n.post!.uri) &&
    !flagged(n.post!.labels) &&
    !flagged(n.post!.author.labels) &&
    parseAtUri(n.post!.uri) !== null;

  // Pick which replies to show, a level at a time, up to the limit.
  const picked = new Set<ThreadNode>();
  let level: ThreadNode[] = root.replies ?? [];
  for (let d = 1; d <= opts.depth && level.length && picked.size < opts.limit; d++) {
    const next: ThreadNode[] = [];
    for (const n of level) {
      if (picked.size >= opts.limit) break;
      if (!visible(n)) continue;
      picked.add(n);
      next.push(...(n.replies ?? []));
    }
    level = next;
  }

  const build = (nodes: ThreadNode[] | undefined): Comment[] =>
    (nodes ?? []).flatMap((n) => {
      if (!picked.has(n) || !n.post) return [];
      const p = n.post;
      const rkey = parseAtUri(p.uri)?.rkey ?? "";
      return [
        {
          url: `https://bsky.app/profile/${p.author.did}/post/${rkey}`,
          author: {
            did: p.author.did,
            handle: p.author.handle,
            displayName: p.author.displayName || undefined,
            avatar: safeAvatar(p.author.avatar),
            url: `https://bsky.app/profile/${p.author.did}`,
          },
          text: p.record.text ?? "",
          createdAt: p.record.createdAt ?? p.indexedAt ?? "",
          likeCount: p.likeCount ?? 0,
          byPostAuthor: p.author.did === rootAuthor,
          replies: build(n.replies),
        },
      ];
    });

  return {
    postUrl: `https://bsky.app/profile/${root.post.author.did}/post/${parts.rkey}`,
    replyCount: root.post.replyCount ?? 0,
    comments: build(root.replies),
  };
}

/** Where a Bluesky post can link to a page: a link card, or a link in the text. */
const LINK_PATHS = [
  ".embed.external.uri",
  ".embed.media.external.uri",
  ".facets[].features[app.bsky.richtext.facet#link].uri",
  ".facets[app.bsky.richtext.facet].features[app.bsky.richtext.facet#link].uri",
];

interface LinkingRecord {
  did: string;
  collection: string;
  rkey: string;
}

/**
 * Posts that link to any of `urls`, from the Constellation backlink index,
 * optionally only those by `did`. Empty when there are none (or the index
 * can't be reached).
 */
async function linkingPosts(urls: string[], did?: string): Promise<LinkingRecord[]> {
  const lookups = urls.flatMap((target) =>
    LINK_PATHS.map(async (path) => {
      const url = new URL("/links", CONSTELLATION);
      url.searchParams.set("target", target);
      url.searchParams.set("collection", "app.bsky.feed.post");
      url.searchParams.set("path", path);
      if (did) url.searchParams.set("did", did);
      url.searchParams.set("limit", "100");
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json", "user-agent": "SonaSky Apollo (links)" },
        });
        if (!res.ok) return [];
        const body = (await res.json()) as { linking_records?: LinkingRecord[] };
        return (body.linking_records ?? []).filter(
          (r) =>
            (!did || r.did === did) && r.collection === "app.bsky.feed.post" && TID_RE.test(r.rkey),
        );
      } catch {
        return [];
      }
    }),
  );
  return (await Promise.all(lookups)).flat();
}

/**
 * The earliest post by `did` that links to any of `urls`, from the
 * Constellation backlink index, as an at:// uri. Null when there isn't one
 * (or the index can't be reached).
 */
export async function findSharePost(did: string, urls: string[]): Promise<string | null> {
  // Post rkeys are TIDs, which sort by creation time.
  const earliest = (await linkingPosts(urls, did)).map((r) => r.rkey).sort()[0];
  return earliest ? `at://${did}/app.bsky.feed.post/${earliest}` : null;
}

/** Newest candidate posts checked against the AppView for `lastLinkedAt`. */
const LINKED_CANDIDATES = 5;
/** Allowance for clock skew before a TID counts as "in the future". */
const TID_SKEW_MS = 5 * 60_000;

/**
 * When anyone last posted a link to any of `urls`, as an ISO time; null when
 * nobody has. rkeys are user-chosen, so TIDs only pick the candidates (future
 * ones are dropped) and the time is the AppView's `indexedAt`, which also
 * confirms the post still exists.
 */
export async function lastLinkedAt(urls: string[]): Promise<string | null> {
  const now = Date.now() + TID_SKEW_MS;
  // A post can match more than one link path, hence the Set.
  const candidates = [
    ...new Set(
      (await linkingPosts(urls))
        .filter((r) => Date.parse(tidTime(r.rkey)) <= now)
        .sort((a, b) => b.rkey.localeCompare(a.rkey))
        .map((r) => `at://${r.did}/app.bsky.feed.post/${r.rkey}`),
    ),
  ].slice(0, LINKED_CANDIDATES);
  if (candidates.length === 0) return null;
  const res = await appview<{ posts: { indexedAt?: string; labels?: Label[] }[] }>(
    "app.bsky.feed.getPosts",
    candidates.map((uri) => ["uris", uri]),
  );
  const times = (res?.posts ?? [])
    .filter((p) => !flagged(p.labels) && p.indexedAt && !Number.isNaN(Date.parse(p.indexedAt)))
    .map((p) => p.indexedAt as string)
    .sort();
  return times.at(-1) ?? null;
}

export async function fetchProfileCard(did: string): Promise<ProfileCard | null> {
  const profile = await appview<ProfileView>("app.bsky.actor.getProfile", [["actor", did]]);
  if (!profile) return null;
  return {
    url: `https://bsky.app/profile/${profile.did}`,
    profile,
    hidden: flagged(profile.labels),
  };
}

export async function fetchStarterPackCard(uri: string): Promise<StarterPackCard | null> {
  const parts = parseAtUri(uri);
  if (!parts || parts.collection !== "app.bsky.graph.starterpack") return null;
  const res = await appview<{
    starterPack: {
      creator: ProfileView;
      record: { name?: string; description?: string };
      list?: { listItemCount?: number };
      labels?: Label[];
    };
  }>("app.bsky.graph.getStarterPack", [["starterPack", uri]]);
  if (!res) return null;
  const sp = res.starterPack;
  return {
    url: `https://bsky.app/starter-pack/${sp.creator.handle}/${parts.rkey}`,
    name: sp.record.name ?? "Starter pack",
    description: sp.record.description,
    creator: sp.creator,
    memberCount: sp.list?.listItemCount,
    hidden: flagged(sp.labels) || flagged(sp.creator.labels),
  };
}

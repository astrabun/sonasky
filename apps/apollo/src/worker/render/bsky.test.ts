import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComments, findSharePost } from "./bsky.ts";

const ROOT = "at://did:plc:owner/app.bsky.feed.post/root";
const post = (rkey: string, did = "did:plc:fan", extra: Record<string, unknown> = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`,
  author: { did, handle: `${did.slice(8)}.bsky.social`, avatar: "https://cdn.bsky.app/a.jpg" },
  record: { text: `text ${rkey}`, createdAt: `2026-10-0${rkey.length}T00:00:00.000Z` },
  likeCount: 1,
  ...extra,
});
const node = (p: object, replies: unknown[] = []) => ({
  $type: "app.bsky.feed.defs#threadViewPost",
  post: p,
  replies,
});

function stubThread(thread: unknown, threadgate?: unknown) {
  const fetch = vi.fn(async (_url: string | URL) => Response.json({ thread, threadgate }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchComments", () => {
  it("builds a tree of comments and asks for the right depth", async () => {
    const fetch = stubThread(
      node(post("root", "did:plc:owner", { replyCount: 2 }), [
        node(post("a"), [node(post("aa", "did:plc:owner"))]),
      ]),
    );
    const res = await fetchComments(ROOT, { depth: 3, limit: 50 });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/xrpc/app.bsky.feed.getPostThread");
    expect(url.searchParams.get("depth")).toBe("3");
    expect(res).toMatchObject({
      postUrl: "https://bsky.app/profile/did:plc:owner/post/root",
      replyCount: 2,
      comments: [
        {
          url: "https://bsky.app/profile/did:plc:fan/post/a",
          text: "text a",
          byPostAuthor: false,
          author: {
            url: "https://bsky.app/profile/did:plc:fan",
            avatar: "https://cdn.bsky.app/a.jpg",
          },
          replies: [{ text: "text aa", byPostAuthor: true, replies: [] }],
        },
      ],
    });
  });

  it("leaves out hidden, labeled, blocked and deleted replies with everything under them", async () => {
    stubThread(
      node(post("root", "did:plc:owner"), [
        node(post("hidden"), [node(post("under-hidden"))]),
        node(post("porn", "did:plc:fan", { labels: [{ val: "porn" }] })),
        node({
          ...post("labeled-author"),
          author: { ...post("x").author, labels: [{ val: "!hide" }] },
        }),
        node(post("negated", "did:plc:fan", { labels: [{ val: "porn", neg: true }] })),
        { $type: "app.bsky.feed.defs#blockedPost", uri: "at://did:plc:b/app.bsky.feed.post/b" },
        { $type: "app.bsky.feed.defs#notFoundPost", uri: "at://did:plc:n/app.bsky.feed.post/n" },
      ]),
      { record: { hiddenReplies: ["at://did:plc:fan/app.bsky.feed.post/hidden"] } },
    );
    const res = await fetchComments(ROOT, { depth: 3, limit: 50 });
    expect(res?.comments.map((c) => c.text)).toEqual(["text negated"]);
  });

  it("fills the limit breadth-first, so a long side thread can't crowd out top-level replies", async () => {
    stubThread(
      node(post("root", "did:plc:owner"), [
        node(post("a"), [node(post("a1"), [node(post("a11"))])]),
        node(post("b")),
      ]),
    );
    const res = await fetchComments(ROOT, { depth: 3, limit: 3 });
    expect(res?.comments.map((c) => c.text)).toEqual(["text a", "text b"]);
    expect(res?.comments[0].replies.map((c) => c.text)).toEqual(["text a1"]);
    expect(res?.comments[0].replies[0].replies).toEqual([]);
  });

  it("drops avatars that aren't on Bluesky's CDN", async () => {
    stubThread(
      node(post("root", "did:plc:owner"), [
        node({
          ...post("a"),
          author: { ...post("a").author, avatar: "https://evil.example/x.png" },
        }),
      ]),
    );
    const res = await fetchComments(ROOT, { depth: 1, limit: 5 });
    expect(res?.comments[0].author.avatar).toBeUndefined();
  });

  it("returns null when the post is gone or Bluesky can't be reached", async () => {
    stubThread({ $type: "app.bsky.feed.defs#notFoundPost", uri: ROOT });
    expect(await fetchComments(ROOT, { depth: 3, limit: 50 })).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 502 })),
    );
    expect(await fetchComments(ROOT, { depth: 3, limit: 50 })).toBeNull();
    expect(
      await fetchComments("at://did:plc:x/app.bsky.actor.profile/self", { depth: 1, limit: 1 }),
    ).toBeNull();
  });
});

describe("findSharePost", () => {
  const OWNER = "did:plc:owner";
  const linking = (rkeys: string[], did = OWNER) => ({
    linking_records: rkeys.map((rkey) => ({ did, collection: "app.bsky.feed.post", rkey })),
  });

  it("asks Constellation for the owner's posts linking to each URL, and picks the earliest", async () => {
    const fetch = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      if (
        u.searchParams.get("path") === ".embed.external.uri" &&
        u.searchParams.get("target") === "https://a.example/@me/hi"
      ) {
        return Response.json(linking(["3my5abcdefghi"]));
      }
      if (
        u.searchParams.get("path")?.startsWith(".facets") &&
        u.searchParams.get("target") === "https://a.example/@did/hi"
      ) {
        return Response.json(linking(["3mx2abcdefghi", "not-a-tid"]));
      }
      return Response.json(linking([]));
    });
    vi.stubGlobal("fetch", fetch);
    expect(
      await findSharePost(OWNER, ["https://a.example/@me/hi", "https://a.example/@did/hi"]),
    ).toBe(`at://${OWNER}/app.bsky.feed.post/3mx2abcdefghi`);
    // Four ways to link (two kinds of card, two spellings of text links) x two URLs.
    expect(fetch).toHaveBeenCalledTimes(8);
    const first = new URL(String(fetch.mock.calls[0][0]));
    expect(first.origin + first.pathname).toBe("https://constellation.microcosm.blue/links");
    expect(first.searchParams.get("did")).toBe(OWNER);
    expect(first.searchParams.get("collection")).toBe("app.bsky.feed.post");
  });

  it("ignores other people's posts, and returns null when there's nothing or the index is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(linking(["3my5abcdefghi"], "did:plc:someone"))),
    );
    expect(await findSharePost(OWNER, ["https://a.example/@me/hi"])).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    expect(await findSharePost(OWNER, ["https://a.example/@me/hi"])).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await findSharePost(OWNER, ["https://a.example/@me/hi"])).toBeNull();
  });
});

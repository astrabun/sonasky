import { afterEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "./bsky.ts";
import { renderComments, type CommentsContext } from "./comments.ts";

const fetchComments = vi.hoisted(() => vi.fn());
const findSharePost = vi.hoisted(() => vi.fn());
vi.mock("./bsky.ts", () => ({ fetchComments, findSharePost }));

const ctx: CommentsContext = {
  did: "did:plc:owner",
  pageUrls: ["https://apollo.example/@me/hi", "https://apollo.example/@did:plc:owner/hi"],
  rewriteHref: (href) => (href.startsWith("https:") ? href : null),
};
const POST = "at://did:plc:owner/app.bsky.feed.post/3mx2abcdefghi";
const comment = (text: string, createdAt: string, extra: Partial<Comment> = {}): Comment => ({
  url: `https://bsky.app/profile/did:plc:fan/post/${text}`,
  author: {
    did: "did:plc:fan",
    handle: "fan.bsky.social",
    url: "https://bsky.app/profile/did:plc:fan",
  },
  text,
  createdAt,
  likeCount: 0,
  byPostAuthor: false,
  replies: [],
  ...extra,
});

afterEach(() => vi.resetAllMocks());

describe("renderComments", () => {
  it("finds the owner's post linking to the page when none is chosen", async () => {
    findSharePost.mockResolvedValue(POST);
    fetchComments.mockResolvedValue({ postUrl: "https://bsky.app/p", replyCount: 0, comments: [] });
    const html = await renderComments({}, ctx);
    expect(findSharePost).toHaveBeenCalledWith("did:plc:owner", ctx.pageUrls);
    expect(fetchComments).toHaveBeenCalledWith(POST, { depth: 3, limit: 50 });
    expect(html).toContain("No comments yet");
    expect(html).toContain(`href="https://bsky.app/p">Reply on Bluesky`);
  });

  it("uses the chosen post without looking anything up", async () => {
    fetchComments.mockResolvedValue({ postUrl: "https://bsky.app/p", replyCount: 0, comments: [] });
    await renderComments({ post: POST }, ctx);
    expect(findSharePost).not.toHaveBeenCalled();
  });

  it("shows nothing until the page has been shared on Bluesky", async () => {
    findSharePost.mockResolvedValue(null);
    expect(await renderComments({}, ctx)).toBe("");
    expect(fetchComments).not.toHaveBeenCalled();
  });

  it("says so when Bluesky can't be reached, still linking to the post", async () => {
    fetchComments.mockResolvedValue(null);
    const html = await renderComments({ post: POST }, ctx);
    expect(html).toContain("couldn't be loaded");
    expect(html).toContain(`href="https://bsky.app/profile/did:plc:owner/post/3mx2abcdefghi"`);
  });

  it("escapes, nests and orders comments", async () => {
    fetchComments.mockResolvedValue({
      postUrl: "https://bsky.app/p",
      replyCount: 3,
      comments: [
        comment("second <b>", "2026-10-02T00:00:00.000Z", { likeCount: 5 }),
        comment("first", "2026-10-01T00:00:00.000Z", {
          byPostAuthor: true,
          replies: [comment("nested", "2026-10-03T00:00:00.000Z")],
        }),
      ],
    });
    const oldest = await renderComments({ post: POST, title: "Talk <here>" }, ctx);
    expect(oldest).toContain(`<h2 class="apollo-comments-title">Talk &lt;here&gt;</h2>`);
    expect(oldest).toContain("second &lt;b&gt;");
    expect(oldest).not.toContain("<b>");
    expect(oldest.indexOf(">first<")).toBeLessThan(oldest.indexOf(">second"));
    expect(oldest).toContain(`<span class="apollo-comment-badge">Author</span>`);
    expect(oldest).toContain("Oct 1, 2026");
    expect(oldest.match(/<ol class="apollo-comments-list">/g)).toHaveLength(2);
    const liked = await renderComments({ post: POST, sort: "likes" }, ctx);
    expect(liked.indexOf(">second")).toBeLessThan(liked.indexOf(">first<"));
  });
});

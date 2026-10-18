/**
 * Bluesky comments: replies to a Bluesky post, shown under a page or post (its
 * `comments` setting) or wherever a bskyComments block is. Without a chosen
 * post, the site owner's earliest Bluesky post linking to the page is used;
 * until there is one, nothing is shown.
 */

import type { CommentsSort } from "../../shared/records.ts";
import { fetchComments, findSharePost, type Comment } from "./bsky.ts";
import { esc } from "./escape.ts";

export interface CommentsOptions {
  post?: string;
  title?: string;
  sort?: CommentsSort;
}

export interface CommentsContext {
  /** DID of the site owner (whose share post is looked up). */
  did: string;
  /** Public URLs this page is reachable at, most canonical first. */
  pageUrls: string[];
  rewriteHref: (href: string) => string | null;
}

const DEPTH = 3;
const LIMIT = 50;

/** "Oct 24, 2026", in UTC. */
export function shortDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function sorted(comments: Comment[], sort: CommentsSort): Comment[] {
  const byDate = (a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt);
  return [...comments].sort(
    sort === "newest"
      ? (a, b) => byDate(b, a)
      : sort === "likes"
        ? (a, b) => b.likeCount - a.likeCount || byDate(a, b)
        : byDate,
  );
}

function linked(ctx: CommentsContext, url: string, cls: string, inner: string): string {
  const href = ctx.rewriteHref(url);
  return href
    ? `<a class="${cls}" href="${esc(href)}">${inner}</a>`
    : `<span class="${cls}">${inner}</span>`;
}

function commentHtml(c: Comment, ctx: CommentsContext, sort: CommentsSort): string {
  const a = c.author;
  const avatar = a.avatar
    ? `<img class="apollo-comment-avatar" src="${esc(a.avatar)}" alt="" loading="lazy">`
    : `<span class="apollo-comment-avatar" aria-hidden="true"></span>`;
  const date = shortDate(c.createdAt);
  const head = `<header class="apollo-comment-head">${avatar}${linked(
    ctx,
    a.url,
    "apollo-comment-name",
    esc(a.displayName || a.handle),
  )}${c.byPostAuthor ? `<span class="apollo-comment-badge">Author</span>` : ""}<span class="apollo-comment-sub">@${esc(
    a.handle,
  )}</span>${
    date
      ? linked(
          ctx,
          c.url,
          "apollo-comment-sub",
          `<time datetime="${esc(c.createdAt)}">${esc(date)}</time>`,
        )
      : ""
  }</header>`;
  const likes = c.likeCount
    ? `<p class="apollo-comment-likes">&#9829; ${c.likeCount} ${c.likeCount === 1 ? "like" : "likes"}</p>`
    : "";
  // Replies to a comment read as a conversation, so they stay oldest first.
  const replies = c.replies.length
    ? `<ol class="apollo-comments-list">${sorted(c.replies, sort === "likes" ? "likes" : "oldest")
        .map((r) => commentHtml(r, ctx, sort))
        .join("")}</ol>`
    : "";
  return `<li class="apollo-comment"><article>${head}<p class="apollo-comment-text">${esc(
    c.text,
  )}</p>${likes}</article>${replies}</li>`;
}

export async function renderComments(opts: CommentsOptions, ctx: CommentsContext): Promise<string> {
  const title = opts.title?.trim() || "Comments";
  const sort = opts.sort ?? "oldest";
  const uri = opts.post ?? (await findSharePost(ctx.did, ctx.pageUrls));
  const heading = `<h2 class="apollo-comments-title">${esc(title)}</h2>`;
  const wrap = (inner: string) =>
    `<section class="apollo-comments" aria-label="${esc(title)}">${heading}${inner}</section>`;

  // Not shared on Bluesky yet: no comments section until it is.
  if (!uri) return "";

  const thread = await fetchComments(uri, { depth: DEPTH, limit: LIMIT });
  const [, , did, , rkey] = uri.split("/");
  const postUrl = thread?.postUrl ?? `https://bsky.app/profile/${did}/post/${rkey}`;
  const reply = linked(ctx, postUrl, "apollo-card-cta", "Reply on Bluesky");
  if (!thread) {
    return wrap(
      `<p class="apollo-comments-note">Comments couldn't be loaded right now.</p>${reply}`,
    );
  }
  const comments = sorted(thread.comments, sort);
  return wrap(
    comments.length
      ? `${reply}<ol class="apollo-comments-list">${comments.map((c) => commentHtml(c, ctx, sort)).join("")}</ol>`
      : `<p class="apollo-comments-note">No comments yet. Reply on Bluesky to start the conversation.</p>${reply}`,
  );
}

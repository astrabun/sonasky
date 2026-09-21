import { useState } from "react";
import { getPost, getPostFeeds, resolvePostInput } from "./api";
import { CursorStatus } from "./CursorStatus";
import { RankHistoryChart } from "./RankHistoryChart";
import type { BskyPost, PostFeedsResponse } from "./types";

const describePosition = (result: PostFeedsResponse["results"][number]): string => {
  if (result.pinned) return `pinned at #${(result.pinPosition ?? 0) + 1}`;
  if (result.rank !== undefined) return `#${result.rank + 1}`;
  return "not currently ranked";
};

export function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<BskyPost | null>(null);
  const [feeds, setFeeds] = useState<PostFeedsResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPost(null);
    setFeeds(null);

    try {
      const uri = await resolvePostInput(input);
      if (!uri) {
        setError("Couldn't parse that as a bsky.app post URL or at:// URI.");
        return;
      }

      const [postResult, feedsResult] = await Promise.all([getPost(uri), getPostFeeds(uri)]);
      if (!postResult) {
        setError("Post not found on Bluesky.");
        return;
      }
      setPost(postResult);
      setFeeds(feedsResult);
      setExpanded(new Set());
    } catch {
      setError("Couldn't reach feed-generator. Is it running locally?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">sonasky-feed-explorer</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Look up a Bluesky post to see which SonaSky feeds it's in and its position in each.
        </p>

        <div className="mt-6">
          <CursorStatus />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://bsky.app/profile/handle.bsky.social/post/xxxx or at://..."
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={loading || input.trim() === ""}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {loading ? "Looking up…" : "Look up"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {post && (
          <div className="mt-6 flex gap-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {post.authorAvatar && (
              <img src={post.authorAvatar} alt="" className="size-10 rounded-full" />
            )}
            <div>
              <p className="text-sm font-medium">
                {post.authorDisplayName ?? post.authorHandle}{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  @{post.authorHandle}
                </span>
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                {post.text}
              </p>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {post.likeCount} likes · {post.repostCount} reposts
              </p>
            </div>
          </div>
        )}

        {feeds && (
          <div className="mt-6">
            {!feeds.found && (
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                This post isn't in feed-generator's index (not yet ingested, pruned, or the author
                carries no species label). Showing pin overrides only.
              </p>
            )}
            {feeds.results.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Not in any feed.</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {feeds.results.map((r) => {
                  const isExpanded = expanded.has(r.feedUri);
                  return (
                    <li key={r.feedUri}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.feedUri)) next.delete(r.feedUri);
                            else next.add(r.feedUri);
                            return next;
                          })
                        }
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <span>
                          {r.displayName}{" "}
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            ({r.kind}
                            {r.destination !== "prod" ? `, ${r.destination}` : ""})
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {describePosition(r)}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </span>
                      </button>
                      {isExpanded && post && (
                        <div className="border-t border-slate-100 dark:border-slate-800">
                          <RankHistoryChart uri={post.uri} feedUri={r.feedUri} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

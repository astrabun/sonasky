import { useEffect, useState } from "react";
import { SONASKY_DID } from "@sonasky/labels-def";

const APPVIEW_BASE = "https://public.api.bsky.app";
const BATCH_SIZE = 25;

interface PostRef {
  id: string;
  post: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function useLikeCounts(posts: PostRef[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (posts.length === 0) return;
    let cancelled = false;

    const entries = posts.map(({ id, post }) => ({
      id,
      uri: `at://${SONASKY_DID}/app.bsky.feed.post/${post}`,
    }));

    async function fetchLiveCounts() {
      for (const batch of chunk(entries, BATCH_SIZE)) {
        if (cancelled) return;

        const params = new URLSearchParams();
        for (const { uri } of batch) params.append("uris", uri);

        try {
          const res = await fetch(
            `${APPVIEW_BASE}/xrpc/app.bsky.feed.getPosts?${params.toString()}`,
          );
          if (!res.ok) continue;
          const data = await res.json();
          const byUri = new Map<string, number>(
            (data.posts ?? []).map((p: { uri: string; likeCount?: number }) => [
              p.uri,
              p.likeCount ?? 0,
            ]),
          );

          if (cancelled) return;
          setCounts((prev) => {
            const next = { ...prev };
            for (const { id, uri } of batch) {
              const count = byUri.get(uri);
              if (count !== undefined) next[id] = count;
            }
            return next;
          });
        } catch {
          // do nothing for this batch and move on
        }
      }
    }

    void fetchLiveCounts();

    return () => {
      cancelled = true;
    };
  }, [posts]);

  return counts;
}

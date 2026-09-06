import { useCallback, useEffect, useRef, useState } from "react";
import { SONASKY_DID } from "@sonasky/labels-def";
import { useLocalStorage } from "./useLocalStorage";

const APPVIEW_BASE = "https://public.api.bsky.app";
const PAGE_LIMIT = 100;
const CONCURRENCY = 4;
const CACHE_KEY = "uniqueLikerCount";

interface PostRef {
  id: string;
  post: string;
}

interface CachedCount {
  count: number;
  updatedAt: number;
}

export interface UniqueLikerCount {
  count: number | null;
  updatedAt: number | null;
  refreshing: boolean;
  postsProcessed: number;
  totalPosts: number;
  refresh: () => void;
}

async function collectLikers(uri: string, dids: Set<string>, cancelled: () => boolean) {
  let cursor: string | undefined;
  do {
    if (cancelled()) return;

    const params = new URLSearchParams({ uri, limit: String(PAGE_LIMIT) });
    if (cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`${APPVIEW_BASE}/xrpc/app.bsky.feed.getLikes?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();

      for (const like of data.likes ?? []) {
        const did = like?.actor?.did;
        if (did) dids.add(did);
      }

      cursor = data.cursor;
    } catch {
      return;
    }
  } while (cursor);
}

export function useUniqueLikerCount(posts: PostRef[]): UniqueLikerCount {
  const [cached, setCached] = useLocalStorage<CachedCount | null>(CACHE_KEY, null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const cancelRef = useRef<() => void>(() => {});
  // Identifies the most recently started run so a superseded/cancelled run
  // (e.g. React Strict Mode's double-invoked effect in dev) can't leave the
  // "refreshing" state stuck forever or clobber a newer run's result.
  const runIdRef = useRef(0);

  const refresh = useCallback(() => {
    if (posts.length === 0) return;

    const runId = ++runIdRef.current;
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };

    const dids = new Set<string>();
    let processed = 0;
    const uris = posts.map(({ post }) => `at://${SONASKY_DID}/app.bsky.feed.post/${post}`);

    setRefreshing(true);
    setProgress({ processed: 0, total: uris.length });

    async function worker(queue: { index: number }) {
      while (queue.index < uris.length) {
        const uri = uris[queue.index++];
        await collectLikers(uri, dids, () => cancelled);
        processed += 1;
        if (!cancelled) setProgress({ processed, total: uris.length });
      }
    }

    async function run() {
      const queue = { index: 0 };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, uris.length) }, () => worker(queue)),
      );
      if (runIdRef.current !== runId) return;
      if (!cancelled) setCached({ count: dids.size, updatedAt: Date.now() });
      setRefreshing(false);
    }

    void run();
  }, [posts, setCached]);

  useEffect(() => {
    if (posts.length === 0 || cached !== null) return;
    refresh();
    return () => cancelRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  return {
    count: cached?.count ?? null,
    updatedAt: cached?.updatedAt ?? null,
    refreshing,
    postsProcessed: progress.processed,
    totalPosts: progress.total,
    refresh,
  };
}

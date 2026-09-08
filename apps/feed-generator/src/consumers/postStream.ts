import { Jetstream } from "@skyware/jetstream";
import WebSocket from "ws";
import { db } from "../db/index.ts";
import { labeledDids } from "../labeledDids.ts";
import { optedOutDids } from "../optedOutDids.ts";
import { redis } from "../utils/redis.ts";

const cursorKey = "feeds:jetstream:cursor";
const cursorSaveIntervalMs = 10_000;

/**
 * Consumes the `app.bsky.feed.post` Jetstream, storing posts authored by any
 * account currently in `labeledDids` and dropping deleted posts. The Jetstream
 * cursor is persisted to Redis so restarts resume without a gap.
 */
export async function startPostStream(): Promise<{ flushCursor: () => Promise<void> }> {
  const saved = await redis.get(cursorKey);

  const jetstream = new Jetstream({
    wantedCollections: ["app.bsky.feed.post"],
    ws: WebSocket,
    cursor: saved ? Number(saved) : Date.now() * 1000,
  });

  const saveCursor = async () => {
    if (jetstream.cursor) {
      await redis.set(cursorKey, jetstream.cursor);
    }
  };

  jetstream.onCreate("app.bsky.feed.post", (event) => {
    if (!labeledDids.has(event.did) || optedOutDids.has(event.did)) return;
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    db.insertInto("post")
      .values({
        uri,
        author_did: event.did,
        indexed_at: Math.floor(event.time_us / 1000),
        rkey: event.commit.rkey,
      })
      .onConflict((oc) => oc.column("uri").doNothing())
      .execute()
      .catch((err) => console.error(`Failed to insert post ${uri}:`, err));
  });

  jetstream.onDelete("app.bsky.feed.post", (event) => {
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    db.deleteFrom("post")
      .where("uri", "=", uri)
      .execute()
      .catch((err) => console.error(`Failed to delete post ${uri}:`, err));
  });

  const interval = setInterval(() => {
    saveCursor().catch((err) => console.error("Failed to save jetstream cursor:", err));
  }, cursorSaveIntervalMs);
  interval.unref();

  jetstream.start();
  console.log(`Post stream started${saved ? ` (cursor ${saved})` : ""}`);

  return {
    flushCursor: async () => {
      clearInterval(interval);
      await saveCursor();
    },
  };
}

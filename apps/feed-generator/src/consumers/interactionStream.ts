import { Jetstream } from "@skyware/jetstream";
import WebSocket from "ws";
import { db } from "../db/index.ts";
import { labeledDids } from "../labeledDids.ts";
import { redis } from "../utils/redis.ts";

const cursorKey = "feeds:jetstream:interactions:cursor";
const cursorSaveIntervalMs = 10_000;

type Kind = "like" | "repost";

/**
 * Consumes the `app.bsky.feed.like` and `app.bsky.feed.repost` Jetstreams,
 * recording every like/repost whose author is a currently-labeled account and
 * dropping the row when the like/repost is undone. Feeds the "SonaSky Picks"
 * ranking. Cursor in Redis (`feeds:jetstream:interactions:cursor`); only
 * interactions seen after an account is known to be labeled are captured.
 */
export async function startInteractionStream(): Promise<{ flushCursor: () => Promise<void> }> {
  const saved = await redis.get(cursorKey);

  const jetstream = new Jetstream({
    wantedCollections: ["app.bsky.feed.like", "app.bsky.feed.repost"],
    ws: WebSocket,
    cursor: saved ? Number(saved) : Date.now() * 1000,
  });

  const saveCursor = async () => {
    if (jetstream.cursor) {
      await redis.set(cursorKey, jetstream.cursor);
    }
  };

  const onCreate = (kind: Kind, did: string, rkey: string, subjectUri: unknown, timeUs: number) => {
    if (!labeledDids.has(did) || typeof subjectUri !== "string") return;
    db.insertInto("interaction")
      .values({
        post_uri: subjectUri,
        actor_did: did,
        kind,
        rkey,
        indexed_at: Math.floor(timeUs / 1000),
      })
      .onConflict((oc) => oc.columns(["actor_did", "kind", "rkey"]).doNothing())
      .execute()
      .catch((err) => console.error(`Failed to insert ${kind} ${did}/${rkey}:`, err));
  };

  const onDelete = (kind: Kind, did: string, rkey: string) => {
    db.deleteFrom("interaction")
      .where("actor_did", "=", did)
      .where("kind", "=", kind)
      .where("rkey", "=", rkey)
      .execute()
      .catch((err) => console.error(`Failed to delete ${kind} ${did}/${rkey}:`, err));
  };

  jetstream.onCreate("app.bsky.feed.like", (e) =>
    onCreate("like", e.did, e.commit.rkey, e.commit.record.subject?.uri, e.time_us),
  );
  jetstream.onCreate("app.bsky.feed.repost", (e) =>
    onCreate("repost", e.did, e.commit.rkey, e.commit.record.subject?.uri, e.time_us),
  );
  jetstream.onDelete("app.bsky.feed.like", (e) => onDelete("like", e.did, e.commit.rkey));
  jetstream.onDelete("app.bsky.feed.repost", (e) => onDelete("repost", e.did, e.commit.rkey));

  const interval = setInterval(() => {
    saveCursor().catch((err) => console.error("Failed to save interaction cursor:", err));
  }, cursorSaveIntervalMs);
  interval.unref();

  jetstream.start();
  console.log(`Interaction stream started${saved ? ` (cursor ${saved})` : ""}`);

  return {
    flushCursor: async () => {
      clearInterval(interval);
      await saveCursor();
    },
  };
}

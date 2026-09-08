import { Jetstream } from "@skyware/jetstream";
import WebSocket from "ws";
import { db } from "../db/index.ts";
import { optedOutDids } from "../optedOutDids.ts";
import { redis } from "../utils/redis.ts";

const COLLECTION = "app.bsky.actor.contentVisibilityDeclaration" as const;
const cursorKey = "feeds:jetstream:contentVisibility:cursor";
const cursorSaveIntervalMs = 10_000;

/** `hideFromAlgorithmicRecommendations === true` on an (untyped) declaration record. */
const hidesFromRecs = (record: unknown): boolean =>
  typeof record === "object" &&
  record !== null &&
  (record as { hideFromAlgorithmicRecommendations?: unknown })
    .hideFromAlgorithmicRecommendations === true;

/**
 * Applies an account's current opt-out state. On opt-in, retroactively drops any
 * posts already ingested for the author so they leave every feed on the next
 * refresh; the reverse-chron skeletons also guard against `opt_out` directly, so
 * the effect is immediate there.
 */
const setOptOut = async (did: string, optedOut: boolean): Promise<void> => {
  if (optedOut) {
    await db
      .insertInto("opt_out")
      .values({ did })
      .onConflict((oc) => oc.column("did").doNothing())
      .execute();
    optedOutDids.add(did);
    await db.deleteFrom("post").where("author_did", "=", did).execute();
  } else {
    await db.deleteFrom("opt_out").where("did", "=", did).execute();
    optedOutDids.remove(did);
  }
};

/**
 * Consumes the `app.bsky.actor.contentVisibilityDeclaration` Jetstream and keeps
 * `opt_out` / `optedOutDids` in step with each account's
 * `hideFromAlgorithmicRecommendations` flag (the record key is always `self`; a
 * delete reverts to the default of not hidden). Cursor in Redis
 * (`feeds:jetstream:contentVisibility:cursor`).
 */
export async function startContentVisibilityStream(): Promise<{
  flushCursor: () => Promise<void>;
}> {
  const saved = await redis.get(cursorKey);

  const jetstream = new Jetstream({
    wantedCollections: [COLLECTION],
    ws: WebSocket,
    cursor: saved ? Number(saved) : Date.now() * 1000,
  });

  const saveCursor = async () => {
    if (jetstream.cursor) {
      await redis.set(cursorKey, jetstream.cursor);
    }
  };

  const apply = (did: string, rkey: string, optedOut: boolean) => {
    if (rkey !== "self") return;
    setOptOut(did, optedOut).catch((err) =>
      console.error(`Failed to apply content-visibility for ${did}:`, err),
    );
  };

  jetstream.onCreate(COLLECTION, (e) =>
    apply(e.did, e.commit.rkey, hidesFromRecs(e.commit.record)),
  );
  jetstream.onUpdate(COLLECTION, (e) =>
    apply(e.did, e.commit.rkey, hidesFromRecs(e.commit.record)),
  );
  jetstream.onDelete(COLLECTION, (e) => apply(e.did, e.commit.rkey, false));

  const interval = setInterval(() => {
    saveCursor().catch((err) => console.error("Failed to save content-visibility cursor:", err));
  }, cursorSaveIntervalMs);
  interval.unref();

  jetstream.start();
  console.log(`Content-visibility stream started${saved ? ` (cursor ${saved})` : ""}`);

  return {
    flushCursor: async () => {
      clearInterval(interval);
      await saveCursor();
    },
  };
}

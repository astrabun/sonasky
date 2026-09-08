import { db } from "./db/index.ts";

/**
 * In-memory set of every account DID that has asked to be excluded from
 * algorithmic recommendations (via `app.bsky.actor.contentVisibilityDeclaration`).
 * Written by the content-visibility consumer, read by the post-stream consumer
 * as a cheap pre-filter and by the feed-skeleton / ranking queries as a guard.
 */
const dids = new Set<string>();

/** Load the set from the DB. Call once on boot, before starting the consumers. */
export async function hydrateOptOut(): Promise<void> {
  dids.clear();
  const rows = await db.selectFrom("opt_out").select("did").execute();
  for (const row of rows) {
    dids.add(row.did);
  }
  console.log(`Hydrated optedOutDids with ${dids.size} accounts`);
}

export const optedOutDids = {
  has: (did: string): boolean => dids.has(did),
  add: (did: string): void => void dids.add(did),
  remove: (did: string): void => void dids.delete(did),
  get size(): number {
    return dids.size;
  },
};

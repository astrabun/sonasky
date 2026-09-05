import { db } from "./db/index.ts";

/**
 * In-memory set of every account DID that currently carries at least one
 * SonaSky species label. Written by the label-stream consumer, read by the
 * post-stream consumer as a cheap pre-filter before any DB write.
 */
const dids = new Set<string>();

/** Load the set from the DB. Call once on boot, before starting the consumers. */
export async function hydrate(): Promise<void> {
  dids.clear();
  const rows = await db.selectFrom("account_label").select("did").distinct().execute();
  for (const row of rows) {
    dids.add(row.did);
  }
  console.log(`Hydrated labeledDids with ${dids.size} accounts`);
}

export const labeledDids = {
  has: (did: string): boolean => dids.has(did),
  add: (did: string): void => void dids.add(did),
  remove: (did: string): void => void dids.delete(did),
  get size(): number {
    return dids.size;
  },
};

import { config } from "../config.ts";
import { db } from "../db/index.ts";

const pruneIntervalMs = 60 * 60 * 1000; // hourly

const prune = async (): Promise<void> => {
  const cutoff = Date.now() - config.postRetentionDays * 86_400_000;
  const result = await db.deleteFrom("post").where("indexed_at", "<", cutoff).executeTakeFirst();
  if (result.numDeletedRows) {
    console.log(`Pruned ${result.numDeletedRows} posts older than ${config.postRetentionDays}d`);
  }
};

/** Starts an hourly job deleting posts older than the retention window. */
export function startPrune(): NodeJS.Timeout {
  prune().catch((err) => console.error("Initial prune failed:", err));
  const interval = setInterval(() => {
    prune().catch((err) => console.error("Prune failed:", err));
  }, pruneIntervalMs);
  interval.unref();
  return interval;
}

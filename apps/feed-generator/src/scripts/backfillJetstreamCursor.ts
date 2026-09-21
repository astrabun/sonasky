/**
 * backfillJetstreamCursor.ts
 *
 * Seeds the post/interaction Jetstream cursors (Redis) to N hours in the
 * past, so the next `pnpm feed-generator:start` replays that window from
 * Jetstream's retained backlog instead of starting from "now". Useful for
 * making a fresh local dev DB match prod's recent activity.
 *
 * This only rewinds the CURSOR - it doesn't ingest anything itself. Run it
 * once against a stopped/fresh instance, then start the app normally; the
 * post/interaction stream consumers (src/consumers/postStream.ts,
 * interactionStream.ts) do the actual replay via their existing Jetstream
 * connection, same code path as live tailing.
 *
 * Only posts/interactions from accounts that ALREADY carry a SonaSky label
 * are captured (same filter live ingestion uses), so label sync needs to have
 * caught up first - it always does, automatically, before these streams see
 * their first event (see src/index.ts: labelSync is awaited before
 * postStream/interactionStream start).
 *
 * Jetstream's own retention window bounds how far back this can reach
 * (commonly on the order of a day - check your Jetstream endpoint); asking
 * for more hours than it retains just gets you everything it has.
 *
 * Usage:
 *   pnpm feed-generator:backfill-jetstream-cursor                    # 24h, local Redis only
 *   pnpm feed-generator:backfill-jetstream-cursor -- --hours=48
 *   pnpm feed-generator:backfill-jetstream-cursor -- --force         # overwrite an existing cursor
 *   pnpm feed-generator:backfill-jetstream-cursor -- --yes           # skip the non-local-Redis prompt
 *
 * Also consider running `pnpm feed-generator:backfill-content-visibility`
 * (opt-outs aren't Jetstream-cursor-based; that script does a direct PDS scan
 * instead) so opted-out accounts' posts don't get re-ingested by the replay.
 */

import { createInterface } from "node:readline/promises";
import { config } from "../config.ts";
import { redis } from "../utils/redis.ts";

const POST_CURSOR_KEY = "feeds:jetstream:cursor";
const INTERACTION_CURSOR_KEY = "feeds:jetstream:interactions:cursor";

const args = process.argv.slice(2);
const force = args.includes("--force");
const skipPrompt = args.includes("--yes") || args.includes("-y");
const hoursArg = args.find((a) => a.startsWith("--hours="));
const hours = hoursArg ? Number(hoursArg.slice("--hours=".length)) : 24;

if (!Number.isFinite(hours) || hours <= 0) {
  console.error(`Invalid --hours value: ${hoursArg}`);
  process.exit(1);
}

const looksLocal = (): boolean => {
  try {
    const { hostname } = new URL(config.redisUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "redis";
  } catch {
    return false;
  }
};

const confirmNonLocal = async (): Promise<boolean> => {
  if (skipPrompt) return true;
  if (!process.stdin.isTTY) {
    console.error(
      `REDIS_URL (${config.redisUrl}) doesn't look local - re-run interactively to confirm, ` +
        `or pass --yes if this is intentional.`,
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\nREDIS_URL (${config.redisUrl}) doesn't look like a local dev Redis. ` +
        `Rewinding its Jetstream cursors is meant for local dev only. Continue? [y/N] `,
    );
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
};

const seedCursor = async (key: string, cursor: number): Promise<void> => {
  const existing = await redis.get(key);
  if (existing && !force) {
    console.log(`  ${key}: already set (${existing}) - skipping. Pass --force to overwrite.`);
    return;
  }
  await redis.set(key, cursor);
  console.log(`  ${key}: ${existing ? "overwritten" : "set"} to ${cursor}`);
};

const main = async (): Promise<void> => {
  if (!looksLocal() && !(await confirmNonLocal())) {
    console.log("Aborted.");
    process.exitCode = 1;
    return;
  }

  const cursor = Date.now() * 1000 - hours * 3_600 * 1_000_000;
  console.log(`Seeding Jetstream cursors to ${hours}h ago (${cursor}):`);
  await seedCursor(POST_CURSOR_KEY, cursor);
  await seedCursor(INTERACTION_CURSOR_KEY, cursor);
  console.log("\nDone. Run `pnpm feed-generator:start` to replay from there.");
};

main()
  .catch((err) => {
    console.error("Backfill cursor seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => redis.quit());

import { startContentVisibilityStream } from "./consumers/contentVisibility.ts";
import { startInteracted } from "./consumers/interacted.ts";
import { startInteractionStream } from "./consumers/interactionStream.ts";
import { startLabelSync } from "./consumers/labelSync.ts";
import { startPostStream } from "./consumers/postStream.ts";
import { startPrune } from "./consumers/prune.ts";
import { startTrending } from "./consumers/trending.ts";
import { closeDb } from "./db/index.ts";
import { migrateToLatest } from "./db/migrate.ts";
import { hydrate } from "./labeledDids.ts";
import { hydrateOptOut } from "./optedOutDids.ts";
import { startHttpServer } from "./http/server.ts";
import { redis } from "./utils/redis.ts";

await migrateToLatest();
await hydrate();
await hydrateOptOut();

const labelSync = await startLabelSync();
const contentVisibility = await startContentVisibilityStream();
const postStream = await startPostStream();
const interactionStream = await startInteractionStream();
const pruneInterval = startPrune();
const trending = startTrending();
const interacted = startInteracted();
const server = await startHttpServer();

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    labelSync.stop();
    trending.stop();
    interacted.stop();
    clearInterval(pruneInterval);
    server.close();

    Promise.all([
      postStream.flushCursor(),
      interactionStream.flushCursor(),
      contentVisibility.flushCursor(),
    ])
      .then(() => closeDb())
      .then(() => redis.quit())
      .catch((err) => console.error("Error during shutdown:", err))
      .finally(() => process.exit(0));
  });
}

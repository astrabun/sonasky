import { startLabelSync } from "./consumers/labelSync.ts";
import { startPostStream } from "./consumers/postStream.ts";
import { startPrune } from "./consumers/prune.ts";
import { closeDb } from "./db/index.ts";
import { migrateToLatest } from "./db/migrate.ts";
import { hydrate } from "./labeledDids.ts";
import { startHttpServer } from "./http/server.ts";
import { redis } from "./utils/redis.ts";

await migrateToLatest();
await hydrate();

const labelSync = await startLabelSync();
const postStream = await startPostStream();
const pruneInterval = startPrune();
const server = await startHttpServer();

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    labelSync.stop();
    clearInterval(pruneInterval);
    server.close();

    postStream
      .flushCursor()
      .then(() => closeDb())
      .then(() => redis.quit())
      .catch((err) => console.error("Error during shutdown:", err))
      .finally(() => process.exit(0));
  });
}

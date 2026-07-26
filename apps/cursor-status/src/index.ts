import { createServer } from "node:http";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const port = Number(process.env.PORT ?? 8080);

// Must match the key label-bot persists its Jetstream cursor under.
const jetstreamCursorKey = "jetstream:cursor";

const server = createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }

  const cursor = await redis.get(jetstreamCursorKey);
  const cursorTimeUs = cursor ? Number(cursor) : null;
  const nowMs = Date.now();

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      cursor: cursorTimeUs,
      cursorAt: cursorTimeUs ? new Date(cursorTimeUs / 1000).toISOString() : null,
      now: new Date(nowMs).toISOString(),
      lagMs: cursorTimeUs ? nowMs - cursorTimeUs / 1000 : null,
    }),
  );
});

server.listen(port, () => {
  console.log(`cursor-status listening on port ${port}`);
});

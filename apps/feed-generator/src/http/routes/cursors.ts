import type { ServerResponse } from "node:http";
import { redis } from "../../utils/redis.ts";
import { sendJson } from "../json.ts";

const STREAMS = [
  { name: "post", key: "feeds:jetstream:cursor" },
  { name: "interactions", key: "feeds:jetstream:interactions:cursor" },
  { name: "contentVisibility", key: "feeds:jetstream:contentVisibility:cursor" },
] as const;

interface CursorStatus {
  name: string;
  key: string;
  cursor: number | null;
  /** ms behind "now"; negative would mean ahead (clock skew), 0 is fully caught up. */
  lagMs: number | null;
}

/**
 * Reports each Jetstream consumer's persisted cursor and how far behind "now"
 * it is - lets you watch a backfill (src/scripts/backfillJetstreamCursor.ts)
 * catch up. Not part of the public XRPC surface.
 */
export async function cursors(res: ServerResponse): Promise<void> {
  const now = Date.now();
  const values = await redis.mget(STREAMS.map((s) => s.key));

  const results: CursorStatus[] = STREAMS.map((stream, i) => {
    const raw = values[i];
    const cursor = raw ? Number(raw) : null;
    return {
      name: stream.name,
      key: stream.key,
      cursor,
      lagMs: cursor === null ? null : now - Math.floor(cursor / 1000),
    };
  });

  sendJson(res, 200, { now, streams: results });
}

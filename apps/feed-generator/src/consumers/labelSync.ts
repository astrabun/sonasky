import { generateRealmsOptions } from "@sonasky/labels-def";
import { db } from "../db/index.ts";
import { isServedLabel } from "../feeds.ts";
import { labeledDids } from "../labeledDids.ts";
import { redis } from "../utils/redis.ts";
import { resolveLabelerUrl } from "../utils/labelerEndpoints.ts";

const pollIntervalMs = 60_000;
const PAGE_LIMIT = 250;

const cursorKey = (realm: string) => `feeds:labels:cursor:${realm}`;

const normalizeVal = (val: string): string => val.toLowerCase().replaceAll("_", "-");

interface QueriedLabel {
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts: string;
}

const applyLabel = async (label: QueriedLabel): Promise<void> => {
  // Account labels only (bare-DID subject); post/profile labels don't map to a feed author.
  if (!label.uri.startsWith("did:")) return;
  const val = normalizeVal(label.val);
  if (!isServedLabel(val)) return;

  const did = label.uri;

  if (label.neg) {
    await db
      .deleteFrom("account_label")
      .where("did", "=", did)
      .where("label", "=", val)
      .where("src", "=", label.src)
      .execute();

    const stillLabeled = await db
      .selectFrom("account_label")
      .select("did")
      .where("did", "=", did)
      .limit(1)
      .executeTakeFirst();

    if (!stillLabeled) {
      labeledDids.remove(did);
      await db.deleteFrom("post").where("author_did", "=", did).execute();
    }
    return;
  }

  await db
    .insertInto("account_label")
    .values({ did, label: val, src: label.src, created_at: label.cts })
    .onConflict((oc) => oc.columns(["did", "label", "src"]).doUpdateSet({ created_at: label.cts }))
    .execute();

  labeledDids.add(did);
};

/**
 * Pages through `com.atproto.label.queryLabels` for one realm from the saved
 * cursor to the head, then applies the labels ordered by `cts` so a `neg`
 * always lands after the positive it retracts (the cursor is row-insertion
 * order, which can be out of time order after an Ozone migration). The cursor
 * is an append-order row id, so a later run resumes at exactly the new labels.
 */
const pollRealm = async (realm: string, baseUrl: string): Promise<void> => {
  let cursor = (await redis.get(cursorKey(realm))) ?? undefined;
  const collected: QueriedLabel[] = [];
  let headCursor = cursor;

  for (;;) {
    const url = new URL(`${baseUrl}/xrpc/com.atproto.label.queryLabels`);
    url.searchParams.set("uriPatterns", "*");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`[${realm}] queryLabels HTTP ${res.status}`);
    }
    const data = (await res.json()) as { cursor?: string; labels: QueriedLabel[] };

    collected.push(...data.labels);

    if (!data.cursor || data.cursor === cursor || data.labels.length === 0) {
      break;
    }
    cursor = data.cursor;
    headCursor = data.cursor;
  }

  collected.sort((a, b) => (a.cts < b.cts ? -1 : a.cts > b.cts ? 1 : 0));
  for (const label of collected) {
    await applyLabel(label);
  }

  if (headCursor) {
    await redis.set(cursorKey(realm), headCursor);
  }
};

/**
 * Keeps `account_label` / `labeledDids` in sync with every realm's Ozone
 * labeler by polling `queryLabels`. Runs a full catch-up before returning, then
 * re-polls on an interval.
 */
export async function startLabelSync(): Promise<{ stop: () => void }> {
  const realms = [...generateRealmsOptions()];
  const baseUrls = new Map<string, string>();
  for (const realm of realms) {
    baseUrls.set(realm, await resolveLabelerUrl(realm));
  }

  const runAll = async () => {
    for (const realm of realms) {
      try {
        await pollRealm(realm, baseUrls.get(realm)!);
      } catch (err) {
        console.error(`[${realm}] label poll failed:`, err);
      }
    }
  };

  await runAll();
  console.log(`Label sync caught up: ${labeledDids.size} labeled accounts`);

  const interval = setInterval(() => void runAll(), pollIntervalMs);
  interval.unref();

  return { stop: () => clearInterval(interval) };
}

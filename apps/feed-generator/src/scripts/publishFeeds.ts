/**
 * publishFeeds.ts
 *
 * Publishes one app.bsky.feed.generator record per active SonaSky species label
 * under the main SonaSky account, pointing at this service's did:web. The record
 * key is a stable hash of the label id (see feeds.ts).
 *
 * Idempotent and resumable: existing records with identical content are left
 * untouched (so a re-run after a rate-limit only writes what's missing), and
 * each record's original createdAt is preserved.
 *
 * Requires in the environment:
 *   SONASKY_BSKY_USER / SONASKY_BSKY_PASS - app-password login for the publisher account
 *   SERVICE_HOSTNAME                       - public hostname (service DID is did:web:<this>)
 *
 * Usage: pnpm feed-generator:publish
 */

import { Agent, CredentialSession } from "@atproto/api";
import { config } from "../config.ts";
import { getServedFeeds } from "../feeds.ts";

const COLLECTION = "app.bsky.feed.generator";
const BATCH_SIZE = 200;

interface GeneratorValue {
  did: string;
  displayName: string;
  description: string;
  createdAt: string;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
};

const login = async (): Promise<Agent> => {
  const session = new CredentialSession(new URL("https://bsky.social"));
  await session.login({
    identifier: requireEnv("SONASKY_BSKY_USER"),
    password: requireEnv("SONASKY_BSKY_PASS"),
  });
  console.log(`Authenticated as ${session.did}`);
  return new Agent(session);
};

/** Maps existing feed-generator rkey -> its stored record value. */
const fetchExisting = async (agent: Agent, repo: string): Promise<Map<string, GeneratorValue>> => {
  const existing = new Map<string, GeneratorValue>();
  let cursor: string | undefined;
  do {
    const { data } = await agent.com.atproto.repo.listRecords({
      repo,
      collection: COLLECTION,
      limit: 100,
      cursor,
    });
    for (const record of data.records) {
      const rkey = record.uri.split("/").pop();
      if (rkey) existing.set(rkey, record.value as unknown as GeneratorValue);
    }
    cursor = data.cursor;
  } while (cursor);
  return existing;
};

const isRateLimit = (err: unknown): err is { headers?: Record<string, string> } =>
  typeof err === "object" &&
  err !== null &&
  "status" in err &&
  (err as { status?: number }).status === 429;

const main = async (): Promise<void> => {
  const agent = await login();
  const repo = agent.did;
  if (!repo) throw new Error("Agent has no DID after login");

  const existing = await fetchExisting(agent, repo);
  console.log(`Found ${existing.size} existing feed records`);

  const now = new Date().toISOString();
  const feeds = getServedFeeds();
  const writes = feeds.flatMap((feed) => {
    const prior = existing.get(feed.rkey);
    const value: GeneratorValue = {
      did: config.serviceDid,
      displayName: feed.displayName,
      description: feed.description,
      createdAt: prior?.createdAt ?? now,
    };

    if (
      prior &&
      prior.did === value.did &&
      prior.displayName === value.displayName &&
      prior.description === value.description
    ) {
      return [];
    }

    return [
      {
        $type: prior
          ? ("com.atproto.repo.applyWrites#update" as const)
          : ("com.atproto.repo.applyWrites#create" as const),
        collection: COLLECTION,
        rkey: feed.rkey,
        value: { $type: COLLECTION, ...value },
      },
    ];
  });

  const created = writes.filter((w) => w.$type.endsWith("#create")).length;
  console.log(
    `${writes.length} to write (${created} new, ${writes.length - created} changed), ${feeds.length - writes.length} unchanged`,
  );
  if (writes.length === 0) return;

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writes.slice(i, i + BATCH_SIZE);
    try {
      await agent.com.atproto.repo.applyWrites({ repo, writes: batch });
    } catch (err) {
      if (isRateLimit(err)) {
        const retryAfter = Number(err.headers?.["retry-after"] ?? 0);
        console.error(
          `Rate limited after ${done}/${writes.length} writes. ` +
            `Re-run \`pnpm feed-generator:publish\` in ~${Math.ceil(retryAfter / 60)} min ` +
            `to write the remaining ${writes.length - done} (already-written records are skipped).`,
        );
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    done += batch.length;
    console.log(`  wrote ${done}/${writes.length}`);
  }
  console.log("Feed records published.");
};

main().catch((err) => {
  console.error("Failed to publish feed records:", err);
  process.exitCode = 1;
});

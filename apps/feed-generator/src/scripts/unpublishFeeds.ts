/**
 * unpublishFeeds.ts
 *
 * Deletes app.bsky.feed.generator records under the SonaSky account whose rkey
 * is no longer an active species label (e.g. a label was retired). Safe to run
 * anytime; it never touches records that still have a matching feed.
 *
 * Usage: pnpm feed-generator:unpublish
 */

import { Agent, CredentialSession } from "@atproto/api";
import { getServedFeeds } from "../feeds.ts";

const COLLECTION = "app.bsky.feed.generator";
const BATCH_SIZE = 200;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
};

const main = async (): Promise<void> => {
  const session = new CredentialSession(new URL("https://bsky.social"));
  await session.login({
    identifier: requireEnv("SONASKY_BSKY_USER"),
    password: requireEnv("SONASKY_BSKY_PASS"),
  });
  const agent = new Agent(session);
  const repo = agent.did;
  if (!repo) throw new Error("Agent has no DID after login");

  const active = new Set(getServedFeeds().map((feed) => feed.rkey));

  const stale: string[] = [];
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
      if (rkey && !active.has(rkey)) stale.push(rkey);
    }
    cursor = data.cursor;
  } while (cursor);

  if (stale.length === 0) {
    console.log("No stale feed records.");
    return;
  }

  console.log(`Deleting ${stale.length} stale feed records: ${stale.join(", ")}`);
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const writes = stale.slice(i, i + BATCH_SIZE).map((rkey) => ({
      $type: "com.atproto.repo.applyWrites#delete" as const,
      collection: COLLECTION,
      rkey,
    }));
    await agent.com.atproto.repo.applyWrites({ repo, writes });
  }
};

main()
  .then(() => console.log("Done."))
  .catch((err) => {
    console.error("Failed to unpublish feed records:", err);
    process.exitCode = 1;
  });

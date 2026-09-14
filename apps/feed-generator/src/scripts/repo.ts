import { Agent, CredentialSession } from "@atproto/api";
import type { Destination } from "@sonasky/feeds-def";

export type { Destination } from "@sonasky/feeds-def";

export const COLLECTION = "app.bsky.feed.generator";
export const BATCH_SIZE = 200;

export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
};

const CREDENTIAL_ENV: Record<Destination, { user: string; pass: string }> = {
  prod: { user: "SONASKY_BSKY_USER", pass: "SONASKY_BSKY_PASS" },
  test: { user: "TEST_BSKY_USER", pass: "TEST_BSKY_PASS" },
};

/** Whether both login env vars for a destination are set, without throwing. */
export const hasCredentials = (destination: Destination): boolean => {
  const { user, pass } = CREDENTIAL_ENV[destination];
  return Boolean(process.env[user] && process.env[pass]);
};

/**
 * Logs in as the account for the given destination: the main SonaSky account
 * (SONASKY_BSKY_USER / SONASKY_BSKY_PASS) for "prod", or the separate test
 * account (TEST_BSKY_USER / TEST_BSKY_PASS) for "test".
 */
export const login = async (
  destination: Destination = "prod",
): Promise<{ agent: Agent; repo: string; handle: string }> => {
  const { user, pass } = CREDENTIAL_ENV[destination];
  const session = new CredentialSession(new URL("https://bsky.social"));
  await session.login({
    identifier: requireEnv(user),
    password: requireEnv(pass),
  });
  const agent = new Agent(session);
  if (!agent.did) throw new Error("Agent has no DID after login");
  return { agent, repo: agent.did, handle: session.session?.handle ?? "(unknown handle)" };
};

/** Every app.bsky.feed.generator record key currently in the repo. */
export const listGeneratorRkeys = async (agent: Agent, repo: string): Promise<string[]> => {
  const rkeys: string[] = [];
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
      if (rkey) rkeys.push(rkey);
    }
    cursor = data.cursor;
  } while (cursor);
  return rkeys;
};

/** Deletes the given generator records in batched applyWrites. */
export const deleteGeneratorRecords = async (
  agent: Agent,
  repo: string,
  rkeys: string[],
): Promise<void> => {
  for (let i = 0; i < rkeys.length; i += BATCH_SIZE) {
    const writes = rkeys.slice(i, i + BATCH_SIZE).map((rkey) => ({
      $type: "com.atproto.repo.applyWrites#delete" as const,
      collection: COLLECTION,
      rkey,
    }));
    await agent.com.atproto.repo.applyWrites({ repo, writes });
  }
};

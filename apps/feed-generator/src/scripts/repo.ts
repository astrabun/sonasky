import { Agent, CredentialSession } from "@atproto/api";

export const COLLECTION = "app.bsky.feed.generator";
export const BATCH_SIZE = 200;

export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
};

/** Logs in as the SonaSky publisher account (SONASKY_BSKY_USER / SONASKY_BSKY_PASS). */
export const login = async (): Promise<{ agent: Agent; repo: string; handle: string }> => {
  const session = new CredentialSession(new URL("https://bsky.social"));
  await session.login({
    identifier: requireEnv("SONASKY_BSKY_USER"),
    password: requireEnv("SONASKY_BSKY_PASS"),
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

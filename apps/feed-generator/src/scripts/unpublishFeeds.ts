/**
 * unpublishFeeds.ts
 *
 * Deletes app.bsky.feed.generator records under the SonaSky account whose rkey
 * is no longer an active feed (e.g. a label was retired). Safe to run anytime;
 * it never touches records that still have a matching feed.
 *
 * Usage: pnpm feed-generator:unpublish
 */

import { getServedFeeds } from "../feeds.ts";
import { deleteGeneratorRecords, listGeneratorRkeys, login } from "./repo.ts";

const main = async (): Promise<void> => {
  const { agent, repo } = await login();

  const active = new Set(getServedFeeds().map((feed) => feed.rkey));
  const stale = (await listGeneratorRkeys(agent, repo)).filter((rkey) => !active.has(rkey));

  if (stale.length === 0) {
    console.log("No stale feed records.");
    return;
  }

  console.log(`Deleting ${stale.length} stale feed records: ${stale.join(", ")}`);
  await deleteGeneratorRecords(agent, repo, stale);
};

main()
  .then(() => console.log("Done."))
  .catch((err) => {
    console.error("Failed to unpublish feed records:", err);
    process.exitCode = 1;
  });

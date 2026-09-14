/**
 * unpublishFeeds.ts
 *
 * Deletes app.bsky.feed.generator records under a destination's account whose
 * rkey is no longer an active feed for that destination (e.g. a label was
 * retired, or a feed's destination changed). Safe to run anytime; it never
 * touches records that still have a matching feed.
 *
 * Usage:
 *   pnpm feed-generator:unpublish              # prod (default)
 *   pnpm feed-generator:unpublish -- --dest=test
 *
 * If --dest=test is given but TEST_BSKY_USER/TEST_BSKY_PASS aren't set, this
 * exits cleanly instead of failing.
 */

import { getServedFeeds } from "../feeds.ts";
import { deleteGeneratorRecords, hasCredentials, listGeneratorRkeys, login } from "./repo.ts";
import { parseDestination } from "./parseDestination.ts";

const destination = parseDestination(process.argv.slice(2));

const main = async (): Promise<void> => {
  if (destination === "test" && !hasCredentials("test")) {
    console.log("TEST_BSKY_USER/TEST_BSKY_PASS not set - skipping test-destination unpublish.");
    return;
  }

  const { agent, repo } = await login(destination);

  const active = new Set(
    getServedFeeds()
      .filter((feed) => feed.destination === destination)
      .map((feed) => feed.rkey),
  );
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

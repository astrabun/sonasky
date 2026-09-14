/**
 * purgeFeeds.ts
 *
 * DESTRUCTIVE. Deletes *every* app.bsky.feed.generator record in the logged-in
 * account's repo - not just stale ones. Intended for wiping a test account.
 * Prompts for confirmation (type the account handle); pass --yes to skip the
 * prompt in a non-interactive context.
 *
 * Usage:
 *   pnpm feed-generator:purge                       # prod (default)
 *   pnpm feed-generator:purge -- --dest=test --yes
 *
 * If --dest=test is given but TEST_BSKY_USER/TEST_BSKY_PASS aren't set, this
 * exits cleanly instead of failing.
 */

import { createInterface } from "node:readline/promises";
import { deleteGeneratorRecords, hasCredentials, listGeneratorRkeys, login } from "./repo.ts";
import { parseDestination } from "./parseDestination.ts";

const destination = parseDestination(process.argv.slice(2));
const skipPrompt = process.argv.includes("--yes") || process.argv.includes("-y");

const confirm = async (handle: string, count: number): Promise<boolean> => {
  if (skipPrompt) return true;
  if (!process.stdin.isTTY) {
    console.error("Not a TTY - re-run interactively, or pass --yes to skip the prompt.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\nThis will PERMANENTLY DELETE all ${count} feed record(s) from "${handle}".\n` +
        `Type the handle to confirm: `,
    );
    return answer.trim() === handle;
  } finally {
    rl.close();
  }
};

const main = async (): Promise<void> => {
  if (destination === "test" && !hasCredentials("test")) {
    console.log("TEST_BSKY_USER/TEST_BSKY_PASS not set - skipping test-destination purge.");
    return;
  }

  const { agent, repo, handle } = await login(destination);
  console.log(`Authenticated as ${handle} (${repo})`);

  const rkeys = await listGeneratorRkeys(agent, repo);
  if (rkeys.length === 0) {
    console.log("No feed records to delete.");
    return;
  }

  if (!(await confirm(handle, rkeys.length))) {
    console.log("Aborted; nothing deleted.");
    process.exitCode = 1;
    return;
  }

  console.log(`Deleting ${rkeys.length} feed record(s)...`);
  await deleteGeneratorRecords(agent, repo, rkeys);
  console.log("Done.");
};

main().catch((err) => {
  console.error("Failed to purge feed records:", err);
  process.exitCode = 1;
});

/**
 * uploadLocalizationsToLabeler.ts
 *
 * Pushes the label value definitions for every realm in
 * @sonasky/labels-def up to that realm's Ozone labeler service record
 * (app.bsky.labeler.service), so the labeler's own definitions
 * stay in sync with this repo.
 *
 * Requires, per realm (e.g. PRIME, POKEMON), in the environment:
 *   {REALM}_BSKY_USER               - Bluesky login identifier for that realm's labeler account
 *   {REALM}_BSKY_PASS                - Bluesky app password for that realm's labeler account
 *   {REALM}_OZONE_SERVICE_USER_DID   - DID of the Ozone service user to publish under
 *
 * Usage:
 *   pnpm sync
 */

import { BskyAgent } from "@atproto/api";
import { generateBskyDefsEnglish, generateRealmsOptions } from "@sonasky/labels-def";

const REASON_TYPES = [
  "com.atproto.moderation.defs#reasonAppeal",
  "com.atproto.moderation.defs#reasonAppeal", // I'm not sure why, but Ozone *really* wants this to be here twice to persist.
];

const SUBJECT_TYPES = ["account"];

let success = true;
let failureError: unknown;

async function main() {
  const realms = generateRealmsOptions();

  for (const realm of realms) {
    const defs = generateBskyDefsEnglish(realm);
    const ozoneServiceUserDid = process.env[
      `${realm.toUpperCase()}_OZONE_SERVICE_USER_DID`
    ] as string;

    const agent = new BskyAgent({
      service: "https://bsky.social",
    });

    BskyAgent.configure({
      appLabelers: [ozoneServiceUserDid ?? ""],
    });

    try {
      await agent.login({
        identifier: (process.env[`${realm.toUpperCase()}_BSKY_USER`] as string).toString(),
        password: (process.env[`${realm.toUpperCase()}_BSKY_PASS`] as string).toString(),
      });

      const uploadLocalizationLabels = async () => {
        await agent.refreshSession();
        const body = {
          repo: ozoneServiceUserDid,
          collection: "app.bsky.labeler.service",
          rkey: "self",
          record: {
            $type: "app.bsky.labeler.service",
            policies: {
              labelValues: defs.labelValues,
              labelValueDefinitions: defs.labelValueDefinitions,
              reasonTypes: REASON_TYPES,
              subjectTypes: SUBJECT_TYPES,
            },
            createdAt: new Date().toISOString(),
          },
        };
        const response = await agent
          .withProxy("atproto_labeler", ozoneServiceUserDid)
          .api.com.atproto.repo.putRecord(body);
        console.log(
          `[${realm.toUpperCase()}] Upload localizations successful:`,
          `[${response.success}]`,
        );
      };

      await uploadLocalizationLabels();
    } catch (err) {
      success = false;
      console.error(`Error processing realm ${realm}:`, err);
      failureError = err;
    }
  }

  if (!success) {
    throw failureError;
  }
}

main()
  .then(() => {
    console.log("All realms processed successfully.");
  })
  .catch((err) => {
    console.error("An error occurred during processing:", err);
    process.exitCode = 1;
  });

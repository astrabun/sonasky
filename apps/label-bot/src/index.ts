import { Jetstream } from "@skyware/jetstream";
import { labels } from "@sonasky/labels-def";
import WebSocket from "ws";
import { isSonaskyScoped } from "./utils/isSonaskyScoped.js";
import { redis } from "./utils/redis.js";
import { getLabeler } from "./utils/getLabeler.js";
import { getLabelerAgent, initLabelerAgents } from "./utils/labelerAgents.js";
import { REF_COLLECTION_NS, hasRefRecords } from "./utils/hasRefRecords.js";

const jetstreamCursorKey = "jetstream:cursor";
const jetstreamCursorSaveIntervalMs = 10_000;

const savedCursor = await redis.get(jetstreamCursorKey);

const jetstream = new Jetstream({
  wantedCollections: ["app.bsky.feed.like", REF_COLLECTION_NS],
  ws: WebSocket,
  // Seed with "now" when there's no saved cursor, so the cursor is always
  // reportable (e.g. via cursor-status) instead of null until the first
  // event arrives.
  cursor: savedCursor ? Number(savedCursor) : Date.now() * 1000,
});

const saveJetstreamCursor = async () => {
  if (jetstream.cursor) {
    await redis.set(jetstreamCursorKey, jetstream.cursor);
  }
};

const jetstreamCursorSaveInterval = setInterval(saveJetstreamCursor, jetstreamCursorSaveIntervalMs);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(jetstreamCursorSaveInterval);
    saveJetstreamCursor()
      .catch((error) => console.error("Failed to save jetstream cursor on shutdown:", error))
      .finally(() => process.exit(0));
  });
}

type EmitLabelOptions = {
  realm: string;
  did: string;
  create?: string[];
  negate?: string[];
};

const emitLabel = async ({ realm, did, create = [], negate = [] }: EmitLabelOptions) => {
  const agent = getLabelerAgent(realm);
  await agent.withProxy("atproto_labeler", agent.did!).tools.ozone.moderation.emitEvent({
    event: {
      $type: "tools.ozone.moderation.defs#modEventLabel",
      createLabelVals: create,
      negateLabelVals: negate,
    },
    subject: {
      $type: "com.atproto.admin.defs#repoRef",
      did,
    },
    createdBy: agent.did!,
    subjectBlobCids: [],
  });
};

const likeCacheKey = (rkey: string) => `like:${rkey}`;

jetstream.onCreate("app.bsky.feed.like", async (event) => {
  if (!isSonaskyScoped({ postUri: event.commit.record.subject.uri })) {
    return;
  }
  console.log(`New like: ${JSON.stringify(event)}`);
  const label = getLabeler({
    postUri: event.commit.record.subject.uri,
  });
  if (label) {
    await emitLabel({ realm: label.realm, did: event.did, create: [label.id] });
    await redis.set(
      likeCacheKey(event.commit.rkey),
      JSON.stringify({ did: event.did, subject: event.commit.record.subject }),
    );
  }
});

jetstream.onDelete("app.bsky.feed.like", async (event) => {
  const cached = await redis.getdel(likeCacheKey(event.commit.rkey));
  if (!cached) {
    return;
  }
  const { did, subject } = JSON.parse(cached);
  const label = getLabeler({
    postUri: (
      subject as {
        cid: string;
        uri: string;
        $type?: "com.atproto.repo.strongRef" | undefined;
      }
    ).uri,
  });
  if (label) {
    await emitLabel({ realm: label.realm, did: event.did, negate: [label.id] });
  }
  console.log(`Deleted like: ${JSON.stringify(event)} for ${JSON.stringify({ did, subject })}`);
});

const refSheetLabelId = "sonasky-ref-sheet-user";
const refSheetLabelRealm = labels[refSheetLabelId]!.realm;

const applyRefSheetLabel = async (did: string, reason: string) => {
  try {
    await emitLabel({ realm: refSheetLabelRealm, did, create: [refSheetLabelId] });
    console.log(`Applied ${refSheetLabelId} to ${did} (${reason})`);
  } catch (error) {
    console.error(`Failed to apply ${refSheetLabelId} to ${did}:`, error);
  }
};

jetstream.onCreate(REF_COLLECTION_NS, (event) =>
  applyRefSheetLabel(event.did, `created ${event.commit.rkey}`),
);

// Updates also apply the label so users who had ref sheets before this bot
// handled app.sonasky.ref get labeled the next time they save a character.
jetstream.onUpdate(REF_COLLECTION_NS, (event) =>
  applyRefSheetLabel(event.did, `updated ${event.commit.rkey}`),
);

jetstream.onDelete(REF_COLLECTION_NS, async (event) => {
  try {
    // Delete events carry no record body, so ask the PDS what's left. Only
    // remove the label when we know for sure there are no ref records left.
    const hasRecords = await hasRefRecords(event.did);
    if (hasRecords !== false) {
      console.log(
        `Kept ${refSheetLabelId} on ${event.did} (deleted ${event.commit.rkey}, ${
          hasRecords ? "other ref records remain" : "could not verify remaining records"
        })`,
      );
      return;
    }
    await emitLabel({ realm: refSheetLabelRealm, did: event.did, negate: [refSheetLabelId] });
    console.log(`Removed ${refSheetLabelId} from ${event.did} (deleted last ref record)`);
  } catch (error) {
    console.error(`Failed to remove ${refSheetLabelId} from ${event.did}:`, error);
  }
});

await initLabelerAgents();
jetstream.start();

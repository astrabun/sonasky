import { Jetstream } from "@skyware/jetstream";
import WebSocket from "ws";
import { isSonaskyScoped } from "./utils/isSonaskyScoped.js";
import { redis } from "./utils/redis.js";
import { getLabeler } from "./utils/getLabeler.js";
import { getLabelerAgent, initLabelerAgents } from "./utils/labelerAgents.js";

const jetstreamCursorKey = "jetstream:cursor";
const jetstreamCursorSaveIntervalMs = 10_000;

const savedCursor = await redis.get(jetstreamCursorKey);

const jetstream = new Jetstream({
  wantedCollections: ["app.bsky.feed.like"],
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
    const agent = getLabelerAgent(label.realm);
    await agent.withProxy("atproto_labeler", agent.did!).tools.ozone.moderation.emitEvent({
      event: {
        $type: "tools.ozone.moderation.defs#modEventLabel",
        createLabelVals: [label.id],
        negateLabelVals: [],
      },
      subject: {
        $type: "com.atproto.admin.defs#repoRef",
        did: event.did,
      },
      createdBy: agent.did!,
      subjectBlobCids: [],
    });
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
    const agent = getLabelerAgent(label.realm);
    await agent.withProxy("atproto_labeler", agent.did!).tools.ozone.moderation.emitEvent({
      event: {
        $type: "tools.ozone.moderation.defs#modEventLabel",
        createLabelVals: [],
        negateLabelVals: [label.id],
      },
      subject: {
        $type: "com.atproto.admin.defs#repoRef",
        did: event.did,
      },
      createdBy: agent.did!,
      subjectBlobCids: [],
    });
  }
  console.log(`Deleted like: ${JSON.stringify(event)} for ${JSON.stringify({ did, subject })}`);
});

await initLabelerAgents();
jetstream.start();

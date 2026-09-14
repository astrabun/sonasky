import { Jetstream } from "@skyware/jetstream";
import WebSocket from "ws";
import { db } from "../db/index.ts";
import { customFeedAuthorDids } from "../feeds.ts";
import { labeledDids } from "../labeledDids.ts";
import { optedOutDids } from "../optedOutDids.ts";
import { redis } from "../utils/redis.ts";

const cursorKey = "feeds:jetstream:cursor";
const cursorSaveIntervalMs = 10_000;

interface EmbedIsh {
  images?: Array<{ alt?: string }>;
  video?: { alt?: string };
  media?: EmbedIsh;
}

interface PostRecordish {
  text?: string;
  tags?: string[];
  facets?: Array<{ features?: Array<{ $type?: string; tag?: string }> }>;
  embed?: EmbedIsh;
}

/** Tags on a post: its `tags` field plus any `#hashtag` facets, lowercased. */
const extractTags = (record: unknown): string[] => {
  const { tags, facets } = record as PostRecordish;
  const set = new Set<string>();
  for (const tag of tags ?? []) set.add(tag.toLowerCase());
  for (const facet of facets ?? []) {
    for (const feature of facet.features ?? []) {
      if (feature.$type === "app.bsky.richtext.facet#tag" && typeof feature.tag === "string") {
        set.add(feature.tag.toLowerCase());
      }
    }
  }
  return [...set];
};

/** Alt text from an image/video embed, or the media half of a quote-with-media embed. */
const extractAltText = (embed: EmbedIsh | undefined): string => {
  if (!embed) return "";
  const alts: string[] = [];
  for (const image of embed.images ?? []) {
    if (image.alt) alts.push(image.alt);
  }
  if (embed.video?.alt) alts.push(embed.video.alt);
  if (embed.media) alts.push(extractAltText(embed.media));
  return alts.join(" ");
};

/**
 * Consumes the `app.bsky.feed.post` Jetstream, storing posts authored by any
 * account currently in `labeledDids` and dropping deleted posts. The Jetstream
 * cursor is persisted to Redis so restarts resume without a gap.
 */
export async function startPostStream(): Promise<{ flushCursor: () => Promise<void> }> {
  const saved = await redis.get(cursorKey);

  const jetstream = new Jetstream({
    wantedCollections: ["app.bsky.feed.post"],
    ws: WebSocket,
    cursor: saved ? Number(saved) : Date.now() * 1000,
  });

  const saveCursor = async () => {
    if (jetstream.cursor) {
      await redis.set(cursorKey, jetstream.cursor);
    }
  };

  jetstream.onCreate("app.bsky.feed.post", (event) => {
    const relevant = labeledDids.has(event.did) || customFeedAuthorDids.has(event.did);
    if (!relevant || optedOutDids.has(event.did)) return;
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    db.insertInto("post")
      .values({
        uri,
        author_did: event.did,
        indexed_at: Math.floor(event.time_us / 1000),
        rkey: event.commit.rkey,
        is_reply: event.commit.record.reply != null,
        tags: extractTags(event.commit.record),
        text: ((event.commit.record as PostRecordish).text ?? "").toLowerCase(),
        alt_text: extractAltText((event.commit.record as PostRecordish).embed).toLowerCase(),
      })
      .onConflict((oc) => oc.column("uri").doNothing())
      .execute()
      .catch((err) => console.error(`Failed to insert post ${uri}:`, err));
  });

  jetstream.onDelete("app.bsky.feed.post", (event) => {
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    db.deleteFrom("post")
      .where("uri", "=", uri)
      .execute()
      .catch((err) => console.error(`Failed to delete post ${uri}:`, err));
  });

  const interval = setInterval(() => {
    saveCursor().catch((err) => console.error("Failed to save jetstream cursor:", err));
  }, cursorSaveIntervalMs);
  interval.unref();

  jetstream.start();
  console.log(`Post stream started${saved ? ` (cursor ${saved})` : ""}`);

  return {
    flushCursor: async () => {
      clearInterval(interval);
      await saveCursor();
    },
  };
}

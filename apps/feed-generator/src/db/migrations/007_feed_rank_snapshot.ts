import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // One row per (feed, post) at each trending/interacted refresh cycle (every
  // 15 min) - lets a post's rank be plotted over time for feeds whose live
  // ranking (a Redis sorted set) has no history of its own. Chrono feeds don't
  // need this: their rank at any past time is reconstructable directly from
  // `post.indexed_at`.
  await db.schema
    .createTable("feed_rank_snapshot")
    .addColumn("feed_rkey", "text", (col) => col.notNull())
    .addColumn("post_uri", "text", (col) => col.notNull())
    .addColumn("rank", "integer", (col) => col.notNull())
    .addColumn("snapshotted_at", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("feed_rank_snapshot_pkey", ["feed_rkey", "post_uri", "snapshotted_at"])
    .execute();

  // Point lookup: this post's history in this feed, walking forward in time.
  await db.schema
    .createIndex("feed_rank_snapshot_post")
    .on("feed_rank_snapshot")
    .columns(["feed_rkey", "post_uri", "snapshotted_at"])
    .execute();

  // Pruning old snapshots.
  await db.schema
    .createIndex("feed_rank_snapshot_snapshotted_at")
    .on("feed_rank_snapshot")
    .column("snapshotted_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("feed_rank_snapshot").execute();
}

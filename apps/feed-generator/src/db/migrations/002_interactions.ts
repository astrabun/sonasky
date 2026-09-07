import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // One row per like/repost of a post by a currently-labeled account. Populated
  // by the interaction-stream consumer; only interactions seen after an account
  // is known to be labeled are captured (no historical backfill).
  await db.schema
    .createTable("interaction")
    .addColumn("post_uri", "text", (col) => col.notNull())
    .addColumn("actor_did", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("rkey", "text", (col) => col.notNull())
    .addColumn("indexed_at", "bigint", (col) => col.notNull())
    // A delete event only carries (actor_did, collection, rkey), so that is the identity.
    .addPrimaryKeyConstraint("interaction_pkey", ["actor_did", "kind", "rkey"])
    .execute();

  // The "SonaSky Picks" refresh groups the last 24h of rows by post_uri.
  await db.schema
    .createIndex("interaction_indexed")
    .on("interaction")
    .column("indexed_at")
    .execute();

  await db.schema.createIndex("interaction_post").on("interaction").column("post_uri").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("interaction").execute();
}

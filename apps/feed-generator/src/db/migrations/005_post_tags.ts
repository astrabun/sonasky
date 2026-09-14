import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Powers tag-filtered custom feeds (feeds-def's CustomFeedFilter.tags).
  // Captured for every ingested post going forward; existing rows default to
  // empty (no backfill).
  await db.schema
    .alterTable("post")
    .addColumn("tags", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute();

  await db.schema.createIndex("post_tags").on("post").using("gin").column("tags").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("post_tags").execute();
  await db.schema.alterTable("post").dropColumn("tags").execute();
}

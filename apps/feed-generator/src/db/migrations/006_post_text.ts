import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Powers `contains`-filtered custom feeds (feeds-def's CustomFeedFilter.contains).
  // Stored lowercased for case-insensitive matching only, not for display.
  // Captured for every ingested post going forward; existing rows default to
  // empty (no backfill).
  await db.schema
    .alterTable("post")
    .addColumn("text", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("alt_text", "text", (col) => col.notNull().defaultTo(""))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("post").dropColumn("text").dropColumn("alt_text").execute();
}

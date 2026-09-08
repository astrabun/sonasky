import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // One row per account that has asked, via
  // `app.bsky.actor.contentVisibilityDeclaration` (`hideFromAlgorithmicRecommendations`),
  // to be kept out of algorithmic recommendation surfaces. Accounts matching:
  // posts are neither ingested nor returned in any skeleton. Populated by
  // the content-visibility consumer; seed pre-existing declarations with
  // `pnpm feed-generator:backfill-content-visibility`.
  await db.schema
    .createTable("opt_out")
    .addColumn("did", "text", (col) => col.primaryKey())
    .addColumn("created_at", sql`timestamptz`, (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("opt_out").execute();
}

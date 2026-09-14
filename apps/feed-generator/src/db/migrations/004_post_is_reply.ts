import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Lets a feed exclude replies (e.g. the "custom" author feeds in feeds.ts).
  // Existing rows default to false; only correct going forward.
  await db.schema
    .alterTable("post")
    .addColumn("is_reply", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("post").dropColumn("is_reply").execute();
}

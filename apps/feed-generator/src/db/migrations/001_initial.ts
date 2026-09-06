import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("account_label")
    .addColumn("did", "text", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("src", "text", (col) => col.notNull())
    .addColumn("created_at", sql`timestamptz`, (col) => col.notNull())
    .addPrimaryKeyConstraint("account_label_pkey", ["did", "label", "src"])
    .execute();

  // Feed skeleton lookups filter by `label` then join on `did`.
  await db.schema
    .createIndex("account_label_label")
    .on("account_label")
    .columns(["label", "did"])
    .execute();

  await db.schema
    .createTable("post")
    .addColumn("uri", "text", (col) => col.primaryKey())
    .addColumn("author_did", "text", (col) => col.notNull())
    .addColumn("indexed_at", "bigint", (col) => col.notNull())
    .addColumn("rkey", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("post_author_indexed")
    .on("post")
    .columns(["author_did", "indexed_at desc"])
    .execute();

  await db.schema.createIndex("post_indexed").on("post").column("indexed_at").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("post").execute();
  await db.schema.dropTable("account_label").execute();
}

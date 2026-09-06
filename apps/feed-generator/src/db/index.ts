import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { config } from "../config.ts";
import type { Database } from "./types.ts";

// Parse int8 (OID 20) as a JS number. Our only bigint column is `post.indexed_at`,
// a ms-epoch value that stays well within Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (value) => Number(value));

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export const closeDb = async (): Promise<void> => {
  await db.destroy();
};

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, Migrator } from "kysely";
import { closeDb, db } from "./index.ts";

const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === "Success") {
      console.log(`Migration "${result.migrationName}" applied`);
    } else if (result.status === "Error") {
      console.error(`Migration "${result.migrationName}" failed`);
    }
  }

  if (error) {
    throw error;
  }
}

// Allow running this file directly: `pnpm feed-generator:migrate`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateToLatest()
    .then(() => console.log("Migrations up to date"))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}

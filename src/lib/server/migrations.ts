import { promises as fs } from "node:fs";
import path from "node:path";
import type { Database } from "./database";

export type MigrationResult = { applied: string[]; alreadyApplied: string[] };

export async function runMigrations(database: Database, directory = path.join(process.cwd(), "db", "migrations")): Promise<MigrationResult> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS _app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const existing = await database.query<{ name: string }>("SELECT name FROM _app_migrations");
  const appliedNames = new Set(existing.rows.map((row) => row.name));
  const result: MigrationResult = { applied: [], alreadyApplied: [] };

  for (const file of files) {
    if (appliedNames.has(file)) {
      result.alreadyApplied.push(file);
      continue;
    }

    const sql = await fs.readFile(path.join(directory, file), "utf8");
    await database.transaction(async (transaction) => {
      await transaction.exec(sql);
      await transaction.query("INSERT INTO _app_migrations (name) VALUES ($1)", [file]);
    });
    result.applied.push(file);
  }

  return result;
}

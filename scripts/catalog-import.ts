import { readFile } from "node:fs/promises";
import path from "node:path";
import { closeDatabase, getDatabase } from "../src/lib/server/database";
import { commitCatalogImport, parseCatalogImport } from "../src/lib/server/catalog-import";
import { runMigrations } from "../src/lib/server/migrations";

async function main() {
  const [source, actorEmail] = process.argv.slice(2);
  if (!source || !actorEmail) throw new Error("Usage: npm run catalog:import -- <csv-path> <admin-email>");
  const database = await getDatabase();
  await runMigrations(database);
  const actor = await database.query<{ id: string }>(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND system_role IN ('ADMIN','SUPER_ADMIN') AND status = 'ACTIVE' LIMIT 1",
    [actorEmail],
  );
  if (!actor.rows[0]) throw new Error("An active administrator with that email was not found.");
  const bytes = await readFile(source);
  const preview = parseCatalogImport(path.basename(source), bytes);
  const result = await commitCatalogImport(database, preview, actor.rows[0].id);
  console.log(JSON.stringify({ ...result, rowCount: preview.rowCount, totalUnits: preview.totalUnits, drafts: preview.drafts }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDatabase);

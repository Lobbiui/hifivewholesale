import { closeDatabase, getDatabase } from "../src/lib/server/database";
import { runMigrations } from "../src/lib/server/migrations";

async function main() {
  const database = await getDatabase();
  const result = await runMigrations(database);
  console.log(JSON.stringify({ engine: database.engine, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);

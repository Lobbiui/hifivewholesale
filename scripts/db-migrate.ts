import { closeDatabase, getDatabase } from "../src/lib/server/database";
import { runMigrations } from "../src/lib/server/migrations";
import { bootstrapStorefrontCatalog } from "../src/lib/server/catalog-bootstrap";

async function main() {
  const database = await getDatabase();
  const result = await runMigrations(database);
  const catalogBootstrap = await bootstrapStorefrontCatalog(database);
  console.log(JSON.stringify({ engine: database.engine, ...result, catalogBootstrap }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);

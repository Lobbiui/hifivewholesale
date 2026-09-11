import { closeDatabase, getDatabase } from "../src/lib/server/database";
import { runMigrations } from "../src/lib/server/migrations";

const requiredTables = [
  "organizations",
  "locations",
  "users",
  "user_credentials",
  "organization_memberships",
  "sessions",
  "buyer_applications",
  "clover_connections",
  "products",
  "product_variants",
  "location_item_mappings",
  "inventory_snapshots",
  "inventory_reservations",
  "orders",
  "order_items",
  "integration_jobs",
  "order_exceptions",
  "audit_events",
  "carts",
  "cart_items",
  "order_requests",
  "order_request_items",
];

async function main() {
  const database = await getDatabase();
  await runMigrations(database);
  const tables = await database.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const actual = new Set(tables.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !actual.has(table));
  if (missing.length) throw new Error(`Database schema is missing: ${missing.join(", ")}`);

  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO organizations (id, legal_name, display_name, organization_type, status)
       VALUES ($1, $2, $3, 'INTERNAL', 'APPROVED')
       ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      ["org_schema_check", "Schema Check", "Schema Check"],
    );
    const check = await transaction.query<{ id: string }>("SELECT id FROM organizations WHERE id = $1", ["org_schema_check"]);
    if (check.rowCount !== 1) throw new Error("Transactional insert check failed.");
    throw new RollbackSmokeTest();
  }).catch((error) => {
    if (!(error instanceof RollbackSmokeTest)) throw error;
  });

  const rolledBack = await database.query<{ id: string }>("SELECT id FROM organizations WHERE id = $1", ["org_schema_check"]);
  if (rolledBack.rowCount !== 0) throw new Error("Database transaction rollback check failed.");

  console.log(JSON.stringify({ ok: true, engine: database.engine, tables: requiredTables.length, transactionRollback: true }, null, 2));
}

class RollbackSmokeTest extends Error {}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const database = new PGlite();

try {
  const migrationDirectory = path.join(process.cwd(), "db", "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    await database.exec(
      await readFile(path.join(migrationDirectory, migration), "utf8"),
    );
  }

  await database.query(
    `INSERT INTO buyer_applications (
      id,legal_business_name,contact_name,business_email,business_phone,
      resale_id,primary_territory,business_type,certification_accepted_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`,
    [
      "application_optional_resale_smoke",
      "Optional Resale Test",
      "Test Buyer",
      "optional-resale@example.test",
      "615-555-0100",
      null,
      "KY",
      "Retail store",
    ],
  );

  const result = await database.query(
    "SELECT resale_id FROM buyer_applications WHERE id=$1",
    ["application_optional_resale_smoke"],
  );
  if (!result.rows[0] || result.rows[0].resale_id !== null) {
    throw new Error("An application without a resale ID did not round-trip.");
  }
  console.log("Wholesale application without a resale ID passed.");
} finally {
  await database.close();
}

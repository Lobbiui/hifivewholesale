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
    `INSERT INTO products (
      id,name,product_type,brand,category,description,tn_registered_upc,
      case_cost_cents,status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      "product_fields_smoke",
      "Product field smoke test",
      "Cartridge",
      "HiFive QA",
      "Test category",
      "Temporary test record",
      "001234567890",
      4200,
      "PUBLISHED",
    ],
  );
  await database.query(
    `INSERT INTO product_variants (
      id,product_id,variant_name,upc,units_per_case,wholesale_price_cents,
      case_cost_cents,safety_stock_units,online_sellable
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      "variant_fields_smoke",
      "product_fields_smoke",
      "Test flavor",
      "009876543210",
      10,
      10000,
      3900,
      2,
      true,
    ],
  );

  const result = await database.query(
    `SELECT p.tn_registered_upc,
            p.case_cost_cents AS product_cost,
            v.case_cost_cents AS variant_cost
       FROM products p
       JOIN product_variants v ON v.product_id=p.id
      WHERE p.id=$1`,
    ["product_fields_smoke"],
  );
  const row = result.rows[0];
  if (
    row?.tn_registered_upc !== "001234567890" ||
    row.product_cost !== 4200 ||
    row.variant_cost !== 3900
  ) {
    throw new Error("Product compliance or cost fields did not round-trip.");
  }
  console.log("Product compliance and protected cost fields passed.");
} finally {
  await database.close();
}

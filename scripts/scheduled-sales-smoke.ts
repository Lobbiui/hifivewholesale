import { promises as fs } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  formatCentralDateTimeInput,
  parseCentralDateTimeInput,
  scheduledSaleStatus,
} from "../src/lib/scheduled-sales";
import { priceRequestedCatalogItems } from "../src/lib/server/order-pricing";

async function main() {
  const database = new PGlite();
  try {
    const directory = path.join(process.cwd(), "db", "migrations");
    const files = (await fs.readdir(directory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files)
      await database.exec(await fs.readFile(path.join(directory, file), "utf8"));

    const centralInput = "2026-11-04T14:30";
    const centralDate = parseCentralDateTimeInput(centralInput);
    if (!centralDate || formatCentralDateTimeInput(centralDate) !== centralInput)
      throw new Error("Central Time sale input did not round-trip.");
    if (
      scheduledSaleStatus({
        price: 75,
        startsAt: "2026-11-04T14:00",
        endsAt: "2026-11-04T15:00",
      }, centralDate) !== "ACTIVE"
    )
      throw new Error("Active sale status was not detected.");

    await database.exec(`
      INSERT INTO organizations (id,legal_name,display_name,organization_type,status)
      VALUES ('sales_org','Sales Test','Sales Test','INTERNAL','APPROVED');
      INSERT INTO products (id,name,product_type,brand,category,status)
      VALUES ('sales_product','Scheduled Sale Test','Test','HiFive','Test','PUBLISHED');
      INSERT INTO product_variants (
        id,product_id,variant_name,units_per_case,wholesale_price_cents,online_sellable
      ) VALUES ('sales_variant','sales_product','Standard',10,10000,TRUE);
      INSERT INTO product_variant_sales (
        id,product_variant_id,sale_price_cents,starts_at,ends_at
      ) VALUES (
        'sales_window','sales_variant',7500,
        CURRENT_TIMESTAMP - INTERVAL '1 minute',
        CURRENT_TIMESTAMP + INTERVAL '1 minute'
      );
    `);
    const active = await database.query<{ effective_price_cents: number }>(`
      SELECT COALESCE(sale.sale_price_cents,v.wholesale_price_cents)::int AS effective_price_cents
      FROM product_variants v
      LEFT JOIN LATERAL (
        SELECT sale_price_cents FROM product_variant_sales s
        WHERE s.product_variant_id=v.id AND s.canceled_at IS NULL
          AND s.starts_at<=CURRENT_TIMESTAMP AND s.ends_at>CURRENT_TIMESTAMP
        ORDER BY s.starts_at DESC LIMIT 1
      ) sale ON TRUE
      WHERE v.id='sales_variant'
    `);
    if (active.rows[0]?.effective_price_cents !== 7500)
      throw new Error("The active scheduled sale price was not selected.");

    const pricedOrder = priceRequestedCatalogItems(
      [
        {
          id: "sales_product",
          name: "Scheduled Sale Test",
          brand: "HiFive",
          category: "Test",
          strength: "Test",
          flavor: "Standard",
          format: "Case",
          description: "",
          price: 7.5,
          casePrice: 75,
          regularPrice: 10,
          regularCasePrice: 100,
          onSale: true,
          hdcpTaxProfile: "PERCENT_OF_LINE",
          hdcpTaxValue: 10,
          unitsPerCase: 10,
          color: "#000000",
          accent: "#ffffff",
          images: [],
          coa: [],
          brandLogo: "",
          sourceUrl: "",
          variants: [
            {
              id: "sales_variant",
              name: "Standard",
              unitsPerCase: 10,
              price: 7.5,
              casePrice: 75,
              regularPrice: 10,
              regularCasePrice: 100,
              onSale: true,
              hdcpTaxProfile: "PERCENT_OF_LINE",
              hdcpTaxValue: 10,
            },
          ],
        },
      ],
      [{ id: "sales_product", variantId: "sales_variant", quantity: 2 }],
    );
    if (
      pricedOrder.subtotalCents !== 15000 ||
      pricedOrder.hdcpTaxCents !== 1500 ||
      pricedOrder.totalCents !== 16500
    )
      throw new Error("Sale pricing did not flow through order and HDCP tax totals.");

    await database.exec(
      "UPDATE product_variant_sales SET canceled_at=CURRENT_TIMESTAMP WHERE id='sales_window'",
    );
    const regular = await database.query<{ effective_price_cents: number }>(`
      SELECT COALESCE(sale.sale_price_cents,v.wholesale_price_cents)::int AS effective_price_cents
      FROM product_variants v
      LEFT JOIN LATERAL (
        SELECT sale_price_cents FROM product_variant_sales s
        WHERE s.product_variant_id=v.id AND s.canceled_at IS NULL
          AND s.starts_at<=CURRENT_TIMESTAMP AND s.ends_at>CURRENT_TIMESTAMP
        ORDER BY s.starts_at DESC LIMIT 1
      ) sale ON TRUE
      WHERE v.id='sales_variant'
    `);
    if (regular.rows[0]?.effective_price_cents !== 10000)
      throw new Error("Canceled sale did not restore the regular price.");

    console.log("Scheduled item sale pricing passed.");
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

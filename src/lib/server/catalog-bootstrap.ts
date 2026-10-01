import { randomUUID } from "node:crypto";
import catalog from "@/lib/catalog.generated.json";
import type { Product } from "@/lib/data";
import type { Database } from "./database";

const launchCatalog = catalog as Product[];

export type CatalogBootstrapResult = {
  catalogProducts: number;
  createdProducts: number;
  createdVariants: number;
  createdDetails: number;
};

/**
 * Copies the original launch catalog into persistent storage without replacing
 * any product, variant, or media details that an administrator has edited.
 */
export async function bootstrapStorefrontCatalog(database: Database): Promise<CatalogBootstrapResult> {
  return database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO organizations (id, legal_name, display_name, organization_type, status)
       VALUES ('org_hifive_internal','HiFive Supply','HiFive Supply','INTERNAL','APPROVED')
       ON CONFLICT (id) DO NOTHING`,
    );
    await transaction.query(
      `INSERT INTO locations (id, organization_id, name, location_type, fulfillment_enabled)
       VALUES ('loc_hifive_warehouse','org_hifive_internal','HiFive Wholesale Warehouse','WAREHOUSE',TRUE)
       ON CONFLICT (id) DO NOTHING`,
    );

    let createdProducts = 0;
    let createdVariants = 0;
    let createdDetails = 0;

    for (const product of launchCatalog) {
      const insertedProduct = await transaction.query(
        `INSERT INTO products (id, name, brand, category, description, status, published_at)
         VALUES ($1,$2,$3,$4,$5,'PUBLISHED',CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        [product.id, product.name, product.brand, product.category, product.description],
      );
      createdProducts += insertedProduct.rowCount;

      const existingVariant = await transaction.query<{ id: string }>(
        "SELECT id FROM product_variants WHERE product_id=$1 ORDER BY created_at LIMIT 1",
        [product.id],
      );
      let variantId = existingVariant.rows[0]?.id;
      if (!variantId) {
        variantId = `variant_launch_${product.id}`;
        const insertedVariant = await transaction.query(
          `INSERT INTO product_variants (
             id, product_id, variant_name, units_per_case, wholesale_price_cents,
             safety_stock_units, online_sellable
           ) VALUES ($1,$2,$3,1,$4,0,TRUE)
           ON CONFLICT (id) DO NOTHING`,
          [variantId, product.id, product.format || "Standard", product.casePrice === null ? null : Math.round(product.casePrice * 100)],
        );
        createdVariants += insertedVariant.rowCount;
      }

      const insertedDetails = await transaction.query(
        `INSERT INTO product_catalog_details (
           product_id, strength, flavor, format, color, accent, badge,
           image_urls, coa_urls, brand_logo_url, source_url
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
         ON CONFLICT (product_id) DO NOTHING`,
        [
          product.id, product.strength, product.flavor, product.format,
          product.color, product.accent, product.badge ?? null,
          JSON.stringify(product.images), JSON.stringify(product.coa), product.brandLogo, product.sourceUrl,
        ],
      );
      createdDetails += insertedDetails.rowCount;

      const inventory = await transaction.query<{ present: number }>(
        "SELECT 1 AS present FROM inventory_snapshots WHERE product_variant_id=$1 LIMIT 1",
        [variantId],
      );
      if (!inventory.rows[0]) {
        await transaction.query(
          `INSERT INTO inventory_snapshots (
             id, location_id, product_variant_id, on_hand_units, safety_stock_units, source, observed_at
           ) VALUES ($1,'loc_hifive_warehouse',$2,0,0,'MANUAL',CURRENT_TIMESTAMP)`,
          [randomUUID(), variantId],
        );
      }
    }

    return { catalogProducts: launchCatalog.length, createdProducts, createdVariants, createdDetails };
  });
}

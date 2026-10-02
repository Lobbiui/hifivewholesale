import catalog from "@/lib/catalog.generated.json";
import type { Product } from "@/lib/data";
import { getDatabase } from "./database";

const fallbackCatalog = catalog as Product[];

type CatalogRow = {
  id: string;
  name: string;
  brand: string;
  category: string;
  product_type: string;
  description: string;
  strength: string;
  flavor: string;
  format: string;
  wholesale_price_cents: number | null;
  units_per_case: number | null;
  color: string;
  accent: string;
  badge: string | null;
  image_urls: unknown;
  coa_urls: unknown;
  brand_logo_url: string;
  source_url: string;
  variant_id: string;
  variant_name: string;
  variant_image_urls: unknown;
  variant_coa_urls: unknown;
};

const catalogQuery = `
  SELECT p.id, p.name, p.brand, p.category, p.product_type, p.description,
         COALESCE(d.strength, '') AS strength,
         COALESCE(d.flavor, '') AS flavor,
         COALESCE(d.format, 'Standard') AS format, v.id AS variant_id, v.variant_name,
         COALESCE(v.image_urls,'[]'::jsonb) AS variant_image_urls,
         COALESCE(v.coa_urls,'[]'::jsonb) AS variant_coa_urls,
         v.wholesale_price_cents, v.units_per_case,
         COALESCE(d.color, '#39244d') AS color,
         COALESCE(d.accent, '#b67cff') AS accent,
         d.badge, COALESCE(d.image_urls, '[]'::jsonb) AS image_urls,
         COALESCE(d.coa_urls, '[]'::jsonb) AS coa_urls,
         COALESCE(d.brand_logo_url, '') AS brand_logo_url,
         COALESCE(d.source_url, '') AS source_url
    FROM products p
    JOIN product_variants v ON v.product_id=p.id AND v.online_sellable=TRUE
    LEFT JOIN product_catalog_details d ON d.product_id = p.id
   WHERE p.status = 'PUBLISHED'
   ORDER BY p.brand, p.name`;

export async function getStorefrontProducts(): Promise<Product[]> {
  try {
    const database = await getDatabase();
    const result = await database.query<CatalogRow>(catalogQuery);
    if (!result.rows.length) return fallbackCatalog;
    const grouped = new Map<string, CatalogRow[]>();
    for (const row of result.rows)
      grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
    return [...grouped.values()].map((rows) => toProduct(rows[0], rows));
  } catch {
    return fallbackCatalog;
  }
}

export async function getStorefrontProduct(
  id: string,
): Promise<Product | null> {
  const products = await getStorefrontProducts();
  return products.find((product) => product.id === id) ?? null;
}

export async function getStorefrontProductsByIds(
  ids: string[],
): Promise<Product[]> {
  if (!ids.length) return [];
  const products = await getStorefrontProducts();
  const wanted = new Set(ids);
  return products.filter((product) => wanted.has(product.id));
}

function toProduct(row: CatalogRow, rows: CatalogRow[]): Product {
  const images = stringArray(row.image_urls);
  const unitPrice =
    row.wholesale_price_cents !== null && row.units_per_case
      ? row.wholesale_price_cents / 100 / row.units_per_case
      : null;
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    productType: row.product_type,
    strength: row.strength,
    flavor: row.flavor || row.name,
    format: row.format,
    description: row.description,
    price: unitPrice,
    casePrice:
      row.wholesale_price_cents === null
        ? null
        : row.wholesale_price_cents / 100,
    color: row.color,
    accent: row.accent,
    badge: row.badge ?? undefined,
    images: images.length ? images : ["/images/hifive-logo-black-banner.png"],
    coa: stringArray(row.coa_urls),
    brandLogo: row.brand_logo_url,
    sourceUrl: row.source_url,
    variants: rows.map((variant) => ({
      id: variant.variant_id,
      name: variant.variant_name,
      unitsPerCase: variant.units_per_case ?? 1,
      price:
        variant.wholesale_price_cents !== null && variant.units_per_case
          ? variant.wholesale_price_cents / 100 / variant.units_per_case
          : null,
      casePrice:
        variant.wholesale_price_cents === null
          ? null
          : variant.wholesale_price_cents / 100,
      images: stringArray(variant.variant_image_urls),
      coa: stringArray(variant.variant_coa_urls),
    })),
  };
}

function stringArray(value: unknown) {
  if (Array.isArray(value))
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  if (typeof value === "string") {
    try {
      return stringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

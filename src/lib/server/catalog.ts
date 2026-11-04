import catalog from "@/lib/catalog.generated.json";
import type { Product } from "@/lib/data";
import type { HdcpTaxProfile } from "@/lib/hdcp-tax";
import { getDatabase } from "./database";

const fallbackCatalog = catalog as Product[];

type CatalogRow = {
  id: string;
  name: string;
  brand: string;
  category: string;
  product_type: string;
  description: string;
  tn_registered_upc: string | null;
  strength: string;
  flavor: string;
  format: string;
  wholesale_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: Date | string | null;
  sale_ends_at: Date | string | null;
  units_per_case: number | null;
  hdcp_tax_profile: HdcpTaxProfile;
  hdcp_tax_value: number | string;
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
         p.tn_registered_upc,
         COALESCE(d.strength, '') AS strength,
         COALESCE(d.flavor, '') AS flavor,
         COALESCE(d.format, 'Standard') AS format, v.id AS variant_id, v.variant_name,
         COALESCE(v.image_urls,'[]'::jsonb) AS variant_image_urls,
         COALESCE(v.coa_urls,'[]'::jsonb) AS variant_coa_urls,
         v.wholesale_price_cents, v.units_per_case,
         sale.sale_price_cents, sale.starts_at AS sale_starts_at,
         sale.ends_at AS sale_ends_at,
         COALESCE(v.hdcp_tax_profile, p.hdcp_tax_profile) AS hdcp_tax_profile,
         COALESCE(v.hdcp_tax_value, p.hdcp_tax_value) AS hdcp_tax_value,
         COALESCE(d.color, '#39244d') AS color,
         COALESCE(d.accent, '#b67cff') AS accent,
         d.badge, COALESCE(d.image_urls, '[]'::jsonb) AS image_urls,
         COALESCE(d.coa_urls, '[]'::jsonb) AS coa_urls,
         COALESCE(d.brand_logo_url, '') AS brand_logo_url,
         COALESCE(d.source_url, '') AS source_url
    FROM products p
    JOIN product_variants v ON v.product_id=p.id AND v.online_sellable=TRUE
    LEFT JOIN LATERAL (
      SELECT s.sale_price_cents,s.starts_at,s.ends_at
        FROM product_variant_sales s
       WHERE s.product_variant_id=v.id
         AND s.canceled_at IS NULL
         AND s.starts_at <= CURRENT_TIMESTAMP
         AND s.ends_at > CURRENT_TIMESTAMP
       ORDER BY s.starts_at DESC
       LIMIT 1
    ) sale ON TRUE
    LEFT JOIN product_catalog_details d ON d.product_id = p.id
   WHERE p.status = 'PUBLISHED'
   ORDER BY p.brand, p.name`;

export async function getStorefrontProducts(): Promise<Product[]> {
  try {
    const database = await getDatabase();
    const result = await database.query<CatalogRow>(catalogQuery);
    if (!result.rows.length) return [];
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
  const productImages = stringArray(row.image_urls);
  const priceRow = rows.find((variant) => variant.sale_price_cents !== null) ?? row;
  const effectivePriceCents =
    priceRow.sale_price_cents ?? priceRow.wholesale_price_cents;
  const unitPrice =
    effectivePriceCents !== null && priceRow.units_per_case
      ? effectivePriceCents / 100 / priceRow.units_per_case
      : null;
  const regularUnitPrice =
    priceRow.wholesale_price_cents !== null && priceRow.units_per_case
      ? priceRow.wholesale_price_cents / 100 / priceRow.units_per_case
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
    tnRegisteredUpc: row.tn_registered_upc ?? undefined,
    price: unitPrice,
    casePrice:
      effectivePriceCents === null
        ? null
        : effectivePriceCents / 100,
    regularPrice: regularUnitPrice,
    regularCasePrice:
      priceRow.wholesale_price_cents === null
        ? null
        : priceRow.wholesale_price_cents / 100,
    saleStartsAt: dateIso(priceRow.sale_starts_at),
    saleEndsAt: dateIso(priceRow.sale_ends_at),
    onSale: priceRow.sale_price_cents !== null,
    hdcpTaxProfile: priceRow.hdcp_tax_profile,
    hdcpTaxValue: Number(priceRow.hdcp_tax_value),
    unitsPerCase: priceRow.units_per_case ?? 1,
    color: row.color,
    accent: row.accent,
    badge: priceRow.sale_price_cents !== null ? "Sale" : row.badge ?? undefined,
    images: productImages.length
      ? productImages
      : ["/images/hifive-logo-black-banner.png"],
    coa: stringArray(row.coa_urls),
    brandLogo: row.brand_logo_url,
    sourceUrl: row.source_url,
    variants: rows.map((variant) => {
      const effectiveVariantPriceCents =
        variant.sale_price_cents ?? variant.wholesale_price_cents;
      return {
        id: variant.variant_id,
        name: variant.variant_name,
        unitsPerCase: variant.units_per_case ?? 1,
        price:
          effectiveVariantPriceCents !== null && variant.units_per_case
            ? effectiveVariantPriceCents / 100 / variant.units_per_case
            : null,
        casePrice:
          effectiveVariantPriceCents === null
            ? null
            : effectiveVariantPriceCents / 100,
        regularPrice:
          variant.wholesale_price_cents !== null && variant.units_per_case
            ? variant.wholesale_price_cents / 100 / variant.units_per_case
            : null,
        regularCasePrice:
          variant.wholesale_price_cents === null
            ? null
            : variant.wholesale_price_cents / 100,
        saleStartsAt: dateIso(variant.sale_starts_at),
        saleEndsAt: dateIso(variant.sale_ends_at),
        onSale: variant.sale_price_cents !== null,
        hdcpTaxProfile: variant.hdcp_tax_profile,
        hdcpTaxValue: Number(variant.hdcp_tax_value),
        images: stringArray(variant.variant_image_urls),
        coa: stringArray(variant.variant_coa_urls),
      };
    }),
  };
}

function dateIso(value: Date | string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

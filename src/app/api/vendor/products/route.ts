import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";
import { getVendorIdentity } from "@/lib/server/vendor-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string;
  brand: string;
  product_line: string | null;
  product_type: string;
  category: string;
  description: string;
  status: string;
  image_urls: unknown;
  coa_urls: unknown;
};

type VariantRow = {
  id: string;
  product_id: string;
  variant_name: string;
  sku: string | null;
  upc: string | null;
  units_per_case: number | null;
  wholesale_price_cents: number | null;
  online_sellable: boolean;
  on_hand_units: number;
  image_urls: unknown;
  coa_urls: unknown;
};

const safeUrls = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
  : [];

export async function GET() {
  const vendor = await getVendorIdentity();
  if (!vendor) return NextResponse.json({ ok: false }, { status: 401 });

  const database = await getDatabase();
  const [products, variants] = await Promise.all([
    database.query<ProductRow>(
      `SELECT p.id,p.name,p.brand,p.product_line,p.product_type,p.category,p.description,p.status,
              COALESCE(d.image_urls,'[]'::jsonb) AS image_urls,
              COALESCE(d.coa_urls,'[]'::jsonb) AS coa_urls
         FROM vendor_product_assignments a
         JOIN products p ON p.id=a.product_id
         LEFT JOIN product_catalog_details d ON d.product_id=p.id
        WHERE a.vendor_organization_id=$1
        ORDER BY p.brand,p.name`,
      [vendor.organizationId],
    ),
    database.query<VariantRow>(
      `SELECT v.id,v.product_id,v.variant_name,v.sku,v.upc,v.units_per_case,
              v.wholesale_price_cents,v.online_sellable,
              COALESCE(latest.on_hand_units,0)::int AS on_hand_units,
              COALESCE(v.image_urls,'[]'::jsonb) AS image_urls,
              COALESCE(v.coa_urls,'[]'::jsonb) AS coa_urls
         FROM vendor_product_assignments a
         JOIN product_variants v ON v.product_id=a.product_id
         LEFT JOIN LATERAL (
           SELECT on_hand_units FROM inventory_snapshots s
            WHERE s.product_variant_id=v.id ORDER BY observed_at DESC LIMIT 1
         ) latest ON TRUE
        WHERE a.vendor_organization_id=$1
        ORDER BY v.product_id,v.created_at`,
      [vendor.organizationId],
    ),
  ]);

  return NextResponse.json({
    ok: true,
    vendor: {
      displayName: vendor.displayName,
      company: vendor.company,
      organizationType: vendor.organizationType,
    },
    products: products.rows.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      productLine: product.product_line ?? "",
      productType: product.product_type,
      category: product.category,
      description: product.description,
      status: product.status,
      imageUrls: safeUrls(product.image_urls),
      coaUrls: safeUrls(product.coa_urls),
      storefrontUrl: product.status === "PUBLISHED" ? `/shop/${encodeURIComponent(product.id)}` : null,
      variants: variants.rows.filter((variant) => variant.product_id === product.id).map((variant) => ({
        id: variant.id,
        name: variant.variant_name,
        sku: variant.sku ?? "",
        upc: variant.upc ?? "",
        unitsPerCase: variant.units_per_case ?? 1,
        price: variant.wholesale_price_cents === null ? null : variant.wholesale_price_cents / 100,
        available: variant.online_sellable && variant.on_hand_units > 0,
        imageUrls: safeUrls(variant.image_urls),
        coaUrls: safeUrls(variant.coa_urls),
      })),
    })),
  });
}

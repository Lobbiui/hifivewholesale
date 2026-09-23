import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = { id: string; name: string; brand: string; status: string; sku: string | null; variant_name: string; wholesale_price_cents: number | null; safety_stock_units: number; on_hand_units: number };
type ImportRow = { id: string; filename: string; import_type: string; row_count: number; total_units: number; draft_products: number; created_at: Date | string };

export async function GET() {
  if (!await getAdminIdentity()) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const database = await getDatabase();
    const [products, imports] = await Promise.all([
      database.query<ProductRow>(
        `SELECT p.id, p.name, p.brand, p.status, v.sku, v.variant_name, v.wholesale_price_cents, v.safety_stock_units,
                COALESCE(latest.on_hand_units, 0)::int AS on_hand_units
           FROM products p
           JOIN LATERAL (SELECT * FROM product_variants candidate WHERE candidate.product_id = p.id ORDER BY candidate.created_at LIMIT 1) v ON TRUE
           LEFT JOIN LATERAL (SELECT snapshot.on_hand_units FROM inventory_snapshots snapshot WHERE snapshot.product_variant_id = v.id ORDER BY snapshot.observed_at DESC LIMIT 1) latest ON TRUE
          ORDER BY p.brand, p.name`,
      ),
      database.query<ImportRow>("SELECT id, filename, import_type, row_count, total_units, draft_products, created_at FROM catalog_imports ORDER BY created_at DESC LIMIT 8"),
    ]);
    return NextResponse.json({
      ok: true,
      products: products.rows.map((row) => ({ id: row.id, name: row.name, brand: row.brand, sku: row.sku ?? "Not assigned", variant: row.variant_name, price: row.wholesale_price_cents === null ? null : row.wholesale_price_cents / 100, stock: row.on_hand_units, lowAt: row.safety_stock_units, status: title(row.status) })),
      imports: imports.rows.map((row) => ({ id: row.id, filename: row.filename, type: row.import_type, rows: row.row_count, units: row.total_units, drafts: row.draft_products, createdAt: new Date(row.created_at).toISOString() })),
    });
  } catch (error) {
    console.error("Admin products could not be loaded", error);
    return NextResponse.json({ ok: false, message: "Catalog records could not be loaded." }, { status: 500 });
  }
}

function title(value: string) { return value.toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }

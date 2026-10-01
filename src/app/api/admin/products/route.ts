import { randomUUID as nodeRandomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAdminIdentity,
  hasValidRequestOrigin,
} from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const randomUUID = (): string => nodeRandomUUID();

type ProductRow = {
  id: string;
  variant_id: string;
  name: string;
  alternate_name: string | null;
  brand: string;
  product_line: string | null;
  category: string;
  description: string;
  status: string;
  sku: string | null;
  upc: string | null;
  variant_name: string;
  units_per_case: number | null;
  wholesale_price_cents: number | null;
  safety_stock_units: number;
  online_sellable: boolean;
  on_hand_units: number;
  strength: string;
  flavor: string;
  format: string;
  image_urls: string[];
};
type ImportRow = {
  id: string;
  filename: string;
  import_type: string;
  row_count: number;
  total_units: number;
  draft_products: number;
  created_at: Date | string;
};
const imageUrlInput = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (value) => !value || /^\/(?!\/)/.test(value) || isHttpsUrl(value),
    "Use an https:// URL or a site path beginning with /.",
  )
  .default("");
const productInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(200),
  alternateName: z.string().trim().max(300).optional().default(""),
  brand: z.string().trim().min(2).max(150),
  productLine: z.string().trim().max(150).optional().default(""),
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().max(10000).default(""),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]),
  sku: z.string().trim().max(120).optional().default(""),
  upc: z.string().trim().max(120).optional().default(""),
  variant: z.string().trim().min(1).max(200),
  unitsPerCase: z.number().int().min(1).max(10000),
  price: z.number().min(0).max(1000000).nullable(),
  stock: z.number().int().min(0).max(100000000),
  lowAt: z.number().int().min(0).max(100000000),
  strength: z.string().trim().max(100).default(""),
  flavor: z.string().trim().max(150).default(""),
  format: z.string().trim().max(150).default(""),
  imageUrl: imageUrlInput,
});

export async function GET() {
  if (!(await getAdminIdentity()))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const database = await getDatabase();
    const [products, imports] = await Promise.all([
      database.query<ProductRow>(
        `SELECT p.id,v.id AS variant_id,p.name,p.alternate_name,p.brand,p.product_line,p.category,p.description,p.status,v.sku,v.upc,v.variant_name,v.units_per_case,v.wholesale_price_cents,v.safety_stock_units,v.online_sellable,COALESCE(latest.on_hand_units,0)::int AS on_hand_units,COALESCE(d.strength,'') AS strength,COALESCE(d.flavor,'') AS flavor,COALESCE(d.format,'') AS format,COALESCE(d.image_urls,'[]'::jsonb) AS image_urls FROM products p JOIN LATERAL (SELECT * FROM product_variants candidate WHERE candidate.product_id=p.id ORDER BY candidate.created_at LIMIT 1) v ON TRUE LEFT JOIN product_catalog_details d ON d.product_id=p.id LEFT JOIN LATERAL (SELECT snapshot.on_hand_units FROM inventory_snapshots snapshot WHERE snapshot.product_variant_id=v.id ORDER BY snapshot.observed_at DESC LIMIT 1) latest ON TRUE ORDER BY p.brand,p.name`,
      ),
      database.query<ImportRow>(
        "SELECT id,filename,import_type,row_count,total_units,draft_products,created_at FROM catalog_imports ORDER BY created_at DESC LIMIT 8",
      ),
    ]);
    return NextResponse.json({
      ok: true,
      products: products.rows.map((row) => ({
        id: row.id,
        variantId: row.variant_id,
        name: row.name,
        alternateName: row.alternate_name ?? "",
        brand: row.brand,
        productLine: row.product_line ?? "",
        category: row.category,
        description: row.description,
        status: title(row.status),
        sku: row.sku ?? "",
        upc: row.upc ?? "",
        variant: row.variant_name,
        unitsPerCase: row.units_per_case ?? 1,
        price:
          row.wholesale_price_cents === null
            ? null
            : row.wholesale_price_cents / 100,
        stock: row.on_hand_units,
        lowAt: row.safety_stock_units,
        onlineSellable: row.online_sellable,
        strength: row.strength,
        flavor: row.flavor,
        format: row.format,
        imageUrl: Array.isArray(row.image_urls)
          ? (row.image_urls[0] ?? "")
          : "",
      })),
      imports: imports.rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        type: row.import_type,
        rows: row.row_count,
        units: row.total_units,
        drafts: row.draft_products,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  } catch (error) {
    console.error("Admin products could not be loaded", error);
    return NextResponse.json(
      { ok: false, message: "Catalog records could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
async function save(request: Request, updating: boolean) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json(
      { ok: false, message: "Request origin was rejected." },
      { status: 403 },
    );
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = productInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (updating && !parsed.data.id))
    return NextResponse.json(
      { ok: false, message: "Complete all required product fields." },
      { status: 422 },
    );
  const data = parsed.data,
    database = await getDatabase();
  try {
    const productId = updating ? data.id! : randomUUID();
    await database.transaction(async (tx) => {
      let variantId = randomUUID();
      const priceCents =
        data.price === null ? null : Math.round(data.price * 100);
      if (updating) {
        const found = await tx.query<{ id: string }>(
          "SELECT id FROM product_variants WHERE product_id=$1 ORDER BY created_at LIMIT 1",
          [productId],
        );
        if (!found.rows[0]) throw new Error("Product variant was not found.");
        variantId = found.rows[0].id;
        await tx.query(
          "UPDATE products SET name=$2,alternate_name=NULLIF($3,''),brand=$4,product_line=NULLIF($5,''),category=$6,description=$7,status=$8,published_at=CASE WHEN $8='PUBLISHED' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [
            productId,
            data.name,
            data.alternateName,
            data.brand,
            data.productLine,
            data.category,
            data.description,
            data.status,
          ],
        );
        await tx.query(
          "UPDATE product_variants SET sku=NULLIF($2,''),upc=NULLIF($3,''),variant_name=$4,units_per_case=$5,wholesale_price_cents=$6,safety_stock_units=$7,online_sellable=$8,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [
            variantId,
            data.sku,
            data.upc,
            data.variant,
            data.unitsPerCase,
            priceCents,
            data.lowAt,
            data.status === "PUBLISHED",
          ],
        );
      } else {
        await tx.query(
          "INSERT INTO products (id,name,alternate_name,brand,product_line,category,description,status,published_at) VALUES ($1,$2,NULLIF($3,''),$4,NULLIF($5,''),$6,$7,$8,CASE WHEN $8='PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END)",
          [
            productId,
            data.name,
            data.alternateName,
            data.brand,
            data.productLine,
            data.category,
            data.description,
            data.status,
          ],
        );
        await tx.query(
          "INSERT INTO product_variants (id,product_id,sku,upc,variant_name,units_per_case,wholesale_price_cents,safety_stock_units,online_sellable) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8,$9)",
          [
            variantId,
            productId,
            data.sku,
            data.upc,
            data.variant,
            data.unitsPerCase,
            priceCents,
            data.lowAt,
            data.status === "PUBLISHED",
          ],
        );
      }
      await tx.query(
        "DELETE FROM catalog_source_mappings WHERE source='CLOVER_ALT_NAME' AND product_variant_id=$1",
        [variantId],
      );
      if (data.alternateName)
        await tx.query(
          "INSERT INTO catalog_source_mappings (id,source,source_key,source_name,product_variant_id) VALUES ($1,'CLOVER_ALT_NAME',$2,$3,$4)",
          [
            randomUUID(),
            normalizeKey(data.alternateName),
            data.alternateName,
            variantId,
          ],
        );
      await tx.query(
        "INSERT INTO product_catalog_details (product_id,strength,flavor,format,image_urls) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (product_id) DO UPDATE SET strength=EXCLUDED.strength,flavor=EXCLUDED.flavor,format=EXCLUDED.format,image_urls=CASE WHEN jsonb_array_length(EXCLUDED.image_urls)=0 THEN product_catalog_details.image_urls ELSE EXCLUDED.image_urls||(product_catalog_details.image_urls-0) END,updated_at=CURRENT_TIMESTAMP",
        [
          productId,
          data.strength,
          data.flavor,
          data.format,
          JSON.stringify(data.imageUrl ? [data.imageUrl] : []),
        ],
      );
      await tx.query(
        "INSERT INTO inventory_snapshots (id,location_id,product_variant_id,on_hand_units,safety_stock_units,source,observed_at) VALUES ($1,'loc_hifive_warehouse',$2,$3,$4,'MANUAL',CURRENT_TIMESTAMP)",
        [randomUUID(), variantId, data.stock, data.lowAt],
      );
      await tx.query(
        "INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id,after_json) VALUES ($1,$2,$3,'PRODUCT',$4,$5)",
        [
          randomUUID(),
          admin.id,
          updating ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
          productId,
          data,
        ],
      );
    });
    return NextResponse.json(
      { ok: true, id: productId },
      { status: updating ? 200 : 201 },
    );
  } catch (error) {
    console.error("Product save failed", error);
    const duplicate =
      error instanceof Error && /unique|duplicate/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        message: duplicate
          ? "That SKU, UPC, or alternate name is already assigned."
          : "The product could not be saved.",
      },
      { status: 422 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 422 });
  const database = await getDatabase();
  await database.transaction(async (tx) => {
    await tx.query(
      "UPDATE products SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
      [id],
    );
    await tx.query(
      "UPDATE product_variants SET online_sellable=FALSE,updated_at=CURRENT_TIMESTAMP WHERE product_id=$1",
      [id],
    );
    await tx.query(
      "INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id) VALUES ($1,$2,'PRODUCT_ARCHIVED','PRODUCT',$3)",
      [randomUUID(), admin.id, id],
    );
  });
  return NextResponse.json({ ok: true });
}
function title(value: string) {
  return value.toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

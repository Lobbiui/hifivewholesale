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
  name: string;
  alternate_name: string | null;
  product_type: string;
  brand: string;
  product_line: string | null;
  category: string;
  description: string;
  status: string;
  strength: string;
  flavor: string;
  format: string;
  image_urls: string[];
  coa_urls: string[];
  color: string;
  accent: string;
};
type VariantRow = {
  id: string;
  product_id: string;
  sku: string | null;
  upc: string | null;
  variant_name: string;
  units_per_case: number | null;
  wholesale_price_cents: number | null;
  safety_stock_units: number;
  online_sellable: boolean;
  on_hand_units: number;
  image_urls: string[];
  coa_urls: string[];
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
  productType: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(2).max(150),
  productLine: z.string().trim().max(150).optional().default(""),
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().max(10000).default(""),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(200),
        upc: z.string().trim().max(120).default(""),
        unitsPerCase: z.number().int().min(1).max(10000),
        price: z.number().min(0).max(1000000).nullable(),
        stock: z.number().int().min(0).max(100000000),
        lowAt: z.number().int().min(0).max(100000000),
        active: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(100),
  productStats: z.string().trim().max(300).default(""),
  flavor: z.string().trim().max(150).default(""),
  format: z.string().trim().max(150).default(""),
  imageUrl: imageUrlInput,
  coaUrl: imageUrlInput,
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#39244d"),
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#b67cff"),
});

export async function GET() {
  if (!(await getAdminIdentity()))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const database = await getDatabase();
    const [products, variants, imports] = await Promise.all([
      database.query<ProductRow>(
        `SELECT p.id,p.name,p.alternate_name,p.product_type,p.brand,p.product_line,p.category,p.description,p.status,COALESCE(d.strength,'') AS strength,COALESCE(d.flavor,'') AS flavor,COALESCE(d.format,'') AS format,COALESCE(d.image_urls,'[]'::jsonb) AS image_urls,COALESCE(d.coa_urls,'[]'::jsonb) AS coa_urls,COALESCE(d.color,'#39244d') AS color,COALESCE(d.accent,'#b67cff') AS accent FROM products p LEFT JOIN product_catalog_details d ON d.product_id=p.id WHERE p.status <> 'ARCHIVED' ORDER BY p.brand,p.name`,
      ),
      database.query<VariantRow>(
        `SELECT v.id,v.product_id,v.sku,v.upc,v.variant_name,v.units_per_case,v.wholesale_price_cents,v.safety_stock_units,v.online_sellable,COALESCE(latest.on_hand_units,0)::int AS on_hand_units,COALESCE(v.image_urls,'[]'::jsonb) AS image_urls,COALESCE(v.coa_urls,'[]'::jsonb) AS coa_urls FROM product_variants v LEFT JOIN LATERAL (SELECT on_hand_units FROM inventory_snapshots s WHERE s.product_variant_id=v.id ORDER BY observed_at DESC LIMIT 1) latest ON TRUE ORDER BY v.created_at`,
      ),
      database.query<ImportRow>(
        "SELECT id,filename,import_type,row_count,total_units,draft_products,created_at FROM catalog_imports ORDER BY created_at DESC LIMIT 8",
      ),
    ]);
    return NextResponse.json({
      ok: true,
      products: products.rows.map((row) => {
        const productVariants = variants.rows
          .filter((variant) => variant.product_id === row.id)
          .map((variant) => ({
            id: variant.id,
            name: variant.variant_name,
            upc: variant.upc ?? "",
            unitsPerCase: variant.units_per_case ?? 1,
            price:
              variant.wholesale_price_cents === null
                ? null
                : variant.wholesale_price_cents / 100,
            stock: variant.on_hand_units,
            lowAt: variant.safety_stock_units,
            active: variant.online_sellable,
            imageUrls: Array.isArray(variant.image_urls)
              ? variant.image_urls
              : [],
            coaUrls: Array.isArray(variant.coa_urls) ? variant.coa_urls : [],
          }));
        return {
          id: row.id,
          name: row.name,
          alternateName: row.alternate_name ?? "",
          productType: row.product_type,
          brand: row.brand,
          productLine: row.product_line ?? "",
          category: row.category,
          description: row.description,
          status: title(row.status),
          variants: productVariants,
          productStats: row.strength,
          flavor: row.flavor,
          format: row.format,
          imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
          coaUrls: Array.isArray(row.coa_urls) ? row.coa_urls : [],
          color: row.color,
          accent: row.accent,
        };
      }),
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
  if (!parsed.success)
    return NextResponse.json(
      {
        ok: false,
        message: parsed.error.issues[0]
          ? `${formatField(parsed.error.issues[0].path)}: ${parsed.error.issues[0].message}`
          : "Complete all required product fields.",
      },
      { status: 422 },
    );
  if (updating && !parsed.data.id)
    return NextResponse.json(
      { ok: false, message: "The product record is missing its saved ID." },
      { status: 422 },
    );
  const data = parsed.data,
    database = await getDatabase();
  try {
    const productId = updating ? data.id! : randomUUID();
    await database.transaction(async (tx) => {
      if (updating) {
        await tx.query(
          "UPDATE products SET name=$2,alternate_name=NULLIF($3,''),product_type=$4,brand=$5,product_line=NULLIF($6,''),category=$7,description=$8,status=$9,published_at=CASE WHEN $9='PUBLISHED' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [
            productId,
            data.name,
            data.alternateName,
            data.productType,
            data.brand,
            data.productLine,
            data.category,
            data.description,
            data.status,
          ],
        );
      } else {
        await tx.query(
          "INSERT INTO products (id,name,alternate_name,product_type,brand,product_line,category,description,status,published_at) VALUES ($1,$2,NULLIF($3,''),$4,$5,NULLIF($6,''),$7,$8,$9,CASE WHEN $9='PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END)",
          [
            productId,
            data.name,
            data.alternateName,
            data.productType,
            data.brand,
            data.productLine,
            data.category,
            data.description,
            data.status,
          ],
        );
      }
      const existing = updating
        ? await tx.query<{ id: string }>(
            "SELECT id FROM product_variants WHERE product_id=$1",
            [productId],
          )
        : { rows: [] };
      const retained = new Set<string>();
      for (const option of data.variants) {
        const found =
          option.id && existing.rows.some((row) => row.id === option.id);
        const variantId = found ? option.id! : randomUUID();
        retained.add(variantId);
        const priceCents =
          option.price === null ? null : Math.round(option.price * 100);
        if (found)
          await tx.query(
            "UPDATE product_variants SET variant_name=$2,upc=NULLIF($3,''),units_per_case=$4,wholesale_price_cents=$5,safety_stock_units=$6,online_sellable=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
            [
              variantId,
              option.name,
              option.upc,
              option.unitsPerCase,
              priceCents,
              option.lowAt,
              option.active,
            ],
          );
        else
          await tx.query(
            "INSERT INTO product_variants (id,product_id,variant_name,upc,units_per_case,wholesale_price_cents,safety_stock_units,online_sellable) VALUES ($1,$2,$3,NULLIF($4,''),$5,$6,$7,$8)",
            [
              variantId,
              productId,
              option.name,
              option.upc,
              option.unitsPerCase,
              priceCents,
              option.lowAt,
              option.active,
            ],
          );
        await tx.query(
          "INSERT INTO inventory_snapshots (id,location_id,product_variant_id,on_hand_units,safety_stock_units,source,observed_at) VALUES ($1,'loc_hifive_warehouse',$2,$3,$4,'MANUAL',CURRENT_TIMESTAMP)",
          [randomUUID(), variantId, option.stock, option.lowAt],
        );
      }
      for (const old of existing.rows)
        if (!retained.has(old.id))
          await tx.query(
            "UPDATE product_variants SET online_sellable=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
            [old.id],
          );
      const primaryVariantId = [...retained][0];
      await tx.query(
        "DELETE FROM catalog_source_mappings WHERE source='CLOVER_ALT_NAME' AND product_variant_id IN (SELECT id FROM product_variants WHERE product_id=$1)",
        [productId],
      );
      if (data.alternateName)
        await tx.query(
          "INSERT INTO catalog_source_mappings (id,source,source_key,source_name,product_variant_id) VALUES ($1,'CLOVER_ALT_NAME',$2,$3,$4)",
          [
            randomUUID(),
            normalizeKey(data.alternateName),
            data.alternateName,
            primaryVariantId,
          ],
        );
      await tx.query(
        "INSERT INTO product_catalog_details (product_id,strength,flavor,format,image_urls,coa_urls,color,accent) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) ON CONFLICT (product_id) DO UPDATE SET strength=EXCLUDED.strength,flavor=EXCLUDED.flavor,format=EXCLUDED.format,image_urls=CASE WHEN jsonb_array_length(EXCLUDED.image_urls)=0 THEN product_catalog_details.image_urls ELSE EXCLUDED.image_urls||(product_catalog_details.image_urls-0) END,coa_urls=CASE WHEN jsonb_array_length(EXCLUDED.coa_urls)=0 THEN product_catalog_details.coa_urls ELSE EXCLUDED.coa_urls||(product_catalog_details.coa_urls-0) END,color=EXCLUDED.color,accent=EXCLUDED.accent,updated_at=CURRENT_TIMESTAMP",
        [
          productId,
          data.productStats,
          data.flavor,
          data.format,
          JSON.stringify(data.imageUrl ? [data.imageUrl] : []),
          JSON.stringify(data.coaUrl ? [data.coaUrl] : []),
          data.color,
          data.accent,
        ],
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

function formatField(path: PropertyKey[]) {
  if (path[0] === "variants" && typeof path[1] === "number")
    return `Shopper option ${path[1] + 1} ${String(path[2] ?? "field")}`;
  return String(path[0] ?? "Product field")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

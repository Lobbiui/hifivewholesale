import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAdminIdentity,
  hasValidRequestOrigin,
} from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.enum(["category", "productType"]);
const nameSchema = z.string().trim().min(2).max(120);
const tableFor = (kind: z.infer<typeof kindSchema>) =>
  kind === "category" ? "catalog_categories" : "catalog_product_types";
const columnFor = (kind: z.infer<typeof kindSchema>) =>
  kind === "category" ? "category" : "product_type";

export async function GET() {
  if (!(await getAdminIdentity()))
    return NextResponse.json({ ok: false }, { status: 401 });
  const database = await getDatabase();
  const [categories, productTypes, products] = await Promise.all([
    database.query<{ name: string }>(
      "SELECT name FROM catalog_categories ORDER BY sort_order, name",
    ),
    database.query<{ name: string }>(
      "SELECT name FROM catalog_product_types ORDER BY sort_order, name",
    ),
    database.query<{
      id: string;
      name: string;
      category: string;
      product_type: string;
    }>(
      "SELECT id,name,category,product_type FROM products WHERE status <> 'ARCHIVED' ORDER BY name",
    ),
  ]);
  return NextResponse.json({
    ok: true,
    categories: categories.rows.map((row) => row.name),
    productTypes: productTypes.rows.map((row) => row.name),
    products: products.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      productType: row.product_type,
    })),
  });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = z
    .object({ kind: kindSchema, name: nameSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "Enter a valid name." },
      { status: 422 },
    );
  const database = await getDatabase();
  await database.query(
    `INSERT INTO ${tableFor(parsed.data.kind)} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [parsed.data.name],
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = z
    .object({ kind: kindSchema, oldName: nameSchema, newName: nameSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "Enter a valid name." },
      { status: 422 },
    );
  const database = await getDatabase();
  const table = tableFor(parsed.data.kind);
  const column = columnFor(parsed.data.kind);
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [parsed.data.newName],
    );
    await transaction.query(
      `UPDATE products SET ${column}=$2,updated_at=CURRENT_TIMESTAMP WHERE ${column}=$1`,
      [parsed.data.oldName, parsed.data.newName],
    );
    if (parsed.data.oldName !== "Uncategorized")
      await transaction.query(`DELETE FROM ${table} WHERE name=$1`, [
        parsed.data.oldName,
      ]);
    await transaction.query(
      "INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id,after_json) VALUES ($1,$2,'TAXONOMY_RENAMED','CATALOG_TAXONOMY',$3,$4)",
      [randomUUID(), admin.id, parsed.data.oldName, parsed.data],
    );
  });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = z
    .object({
      kind: kindSchema,
      name: nameSchema,
      productId: z.string().min(1).max(200),
      assigned: z.boolean(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "The assignment is invalid." },
      { status: 422 },
    );
  const database = await getDatabase();
  const column = columnFor(parsed.data.kind);
  const nextName = parsed.data.assigned ? parsed.data.name : "Uncategorized";
  await database.query(
    `UPDATE products SET ${column}=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
    [parsed.data.productId, nextName],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(request.url);
  const parsed = z
    .object({ kind: kindSchema, name: nameSchema })
    .safeParse({
      kind: url.searchParams.get("kind"),
      name: url.searchParams.get("name"),
    });
  if (!parsed.success || parsed.data.name === "Uncategorized")
    return NextResponse.json(
      { ok: false, message: "That entry cannot be removed." },
      { status: 422 },
    );
  const database = await getDatabase();
  const table = tableFor(parsed.data.kind);
  const column = columnFor(parsed.data.kind);
  await database.transaction(async (transaction) => {
    await transaction.query(
      `UPDATE products SET ${column}='Uncategorized',updated_at=CURRENT_TIMESTAMP WHERE ${column}=$1`,
      [parsed.data.name],
    );
    await transaction.query(`DELETE FROM ${table} WHERE name=$1`, [
      parsed.data.name,
    ]);
  });
  return NextResponse.json({ ok: true });
}

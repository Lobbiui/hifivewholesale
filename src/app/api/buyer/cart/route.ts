import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { getStorefrontProductsByIds } from "@/lib/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cartSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(160), quantity: z.number().int().min(1).max(999) }).strict()).max(100),
}).strict();

type CartItemRow = { product_snapshot_json: unknown; quantity_cases: number };

export async function GET() {
  const buyer = await getBuyerIdentity();
  if (!buyer) return NextResponse.json({ ok: false }, { status: 401 });
  const database = await getDatabase();
  const result = await database.query<CartItemRow>(
    `SELECT ci.product_snapshot_json, ci.quantity_cases
       FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
      WHERE c.buyer_user_id = $1 AND c.status = 'ACTIVE'
      ORDER BY ci.created_at`,
    [buyer.id],
  );
  return NextResponse.json({
    ok: true,
    items: result.rows.map((row) => ({ ...(row.product_snapshot_json as Record<string, unknown>), quantity: row.quantity_cases })),
  });
}

export async function PUT(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const buyer = await getBuyerIdentity();
  if (!buyer) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = cartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "The cart is invalid." }, { status: 422 });

  const products = await getStorefrontProductsByIds(parsed.data.items.map((item) => item.id));
  const catalog = new Map(products.map((product) => [product.id, product]));
  const requested = parsed.data.items.map((item) => ({ product: catalog.get(item.id), quantity: item.quantity }));
  if (requested.some((item) => !item.product)) return NextResponse.json({ ok: false, message: "A cart item is no longer available." }, { status: 422 });

  const database = await getDatabase();
  await database.transaction(async (transaction) => {
    const existing = await transaction.query<{ id: string }>("SELECT id FROM carts WHERE buyer_user_id = $1 AND status = 'ACTIVE' FOR UPDATE", [buyer.id]);
    const cartId = existing.rows[0]?.id ?? `cart_${randomUUID()}`;
    if (!existing.rows[0]) {
      await transaction.query("INSERT INTO carts (id, organization_id, buyer_user_id) VALUES ($1, $2, $3)", [cartId, buyer.organizationId, buyer.id]);
    }
    await transaction.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
    for (const item of requested) {
      await transaction.query(
        `INSERT INTO cart_items (id, cart_id, catalog_product_id, quantity_cases, product_snapshot_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), cartId, item.product!.id, item.quantity, item.product!],
      );
    }
    await transaction.query("UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [cartId]);
  });
  return NextResponse.json({ ok: true });
}

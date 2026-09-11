import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { products } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1).max(160), quantity: z.number().int().min(1).max(999) }).strict()).min(1).max(100),
  method: z.enum(["pickup", "delivery"]),
  contactEmail: z.string().trim().toLowerCase().email().max(254),
  purchaseOrder: z.string().trim().max(120),
  idempotencyKey: z.string().uuid(),
}).strict();

type OrderRequestRow = {
  id: string;
  order_number: string;
  state: string;
  fulfillment_method: string;
  estimated_total_cents: number | null;
  pricing_pending: boolean;
  submitted_at: Date | string;
  item_count?: number;
};

export async function GET() {
  const buyer = await getBuyerIdentity();
  if (!buyer) return NextResponse.json({ ok: false }, { status: 401 });
  const database = await getDatabase();
  const result = await database.query<OrderRequestRow>(
    `SELECT r.id, r.order_number, r.state, r.fulfillment_method, r.estimated_total_cents,
            r.pricing_pending, r.submitted_at, COALESCE(SUM(i.quantity_cases), 0)::int AS item_count
       FROM order_requests r
       LEFT JOIN order_request_items i ON i.order_request_id = r.id
      WHERE r.buyer_user_id = $1
      GROUP BY r.id
      ORDER BY r.submitted_at DESC`,
    [buyer.id],
  );
  return NextResponse.json({ ok: true, orders: result.rows.map(serializeOrder) });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const buyer = await getBuyerIdentity();
  if (!buyer) return NextResponse.json({ ok: false, message: "Approved buyer access is required." }, { status: 401 });
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Review the order details and try again." }, { status: 422 });

  const catalog = new Map(products.map((product) => [product.id, product]));
  const requested = parsed.data.items.map((item) => ({ product: catalog.get(item.id), quantity: item.quantity }));
  if (requested.some((item) => !item.product)) return NextResponse.json({ ok: false, message: "A selected product is no longer available." }, { status: 422 });

  const database = await getDatabase();
  const saved = await database.transaction(async (transaction) => {
    const duplicate = await transaction.query<OrderRequestRow>(
      "SELECT id, order_number, state, fulfillment_method, estimated_total_cents, pricing_pending, submitted_at FROM order_requests WHERE idempotency_key = $1",
      [parsed.data.idempotencyKey],
    );
    if (duplicate.rows[0]) return duplicate.rows[0];

    const id = `request_${randomUUID()}`;
    const orderNumber = `HF-${randomBytes(5).toString("hex").toUpperCase()}`;
    const pricingPending = requested.some((item) => item.product!.casePrice === null);
    const estimatedTotalCents = pricingPending ? null : requested.reduce((sum, item) => sum + Math.round(item.product!.casePrice! * 100) * item.quantity, 0);
    const inserted = await transaction.query<OrderRequestRow>(
      `INSERT INTO order_requests (
         id, order_number, organization_id, buyer_user_id, fulfillment_method, contact_email,
         purchase_order_number, estimated_total_cents, pricing_pending, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8, $9, $10)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, order_number, state, fulfillment_method, estimated_total_cents, pricing_pending, submitted_at`,
      [id, orderNumber, buyer.organizationId, buyer.id, parsed.data.method.toUpperCase(), parsed.data.contactEmail, parsed.data.purchaseOrder, estimatedTotalCents, pricingPending, parsed.data.idempotencyKey],
    );
    if (!inserted.rows[0]) {
      const concurrent = await transaction.query<OrderRequestRow>(
        "SELECT id, order_number, state, fulfillment_method, estimated_total_cents, pricing_pending, submitted_at FROM order_requests WHERE idempotency_key = $1",
        [parsed.data.idempotencyKey],
      );
      if (!concurrent.rows[0]) throw new Error("Idempotent order lookup failed.");
      return concurrent.rows[0];
    }
    for (const item of requested) {
      await transaction.query(
        `INSERT INTO order_request_items (
           id, order_request_id, catalog_product_id, product_name_snapshot, quantity_cases,
           case_price_cents, product_snapshot_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), id, item.product!.id, item.product!.name, item.quantity, item.product!.casePrice === null ? null : Math.round(item.product!.casePrice * 100), item.product!],
      );
    }
    const cart = await transaction.query<{ id: string }>("SELECT id FROM carts WHERE buyer_user_id = $1 AND status = 'ACTIVE'", [buyer.id]);
    if (cart.rows[0]) {
      await transaction.query("UPDATE carts SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [cart.rows[0].id]);
    }
    return inserted.rows[0];
  });
  return NextResponse.json({ ok: true, order: serializeOrder(saved) }, { status: 201 });
}

function serializeOrder(row: OrderRequestRow) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.state.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase()),
    method: row.fulfillment_method.toLowerCase(),
    estimatedTotal: row.estimated_total_cents === null ? null : row.estimated_total_cents / 100,
    pricingPending: row.pricing_pending,
    submitted: new Date(row.submitted_at).toISOString(),
    itemCount: row.item_count ?? 0,
  };
}

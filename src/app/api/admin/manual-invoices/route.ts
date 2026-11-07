import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateHdcpTax, type HdcpTaxProfile } from "@/lib/hdcp-tax";
import { getStaffIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  action: z.literal("create"),
  customerId: z.string().min(1),
  salesRepId: z.string().optional().nullable(),
  fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]),
  purchaseOrder: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(4000).default(""),
  shippingCents: z.number().int().min(0).max(10_000_000).default(0),
  items: z.array(z.object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(1).max(999),
    customCasePriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  })).min(1).max(100),
});
const voidSchema = z.object({ action: z.literal("void"), id: z.string().min(1) });
const input = z.discriminatedUnion("action", [createSchema, voidSchema]);

type CatalogRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  units_per_case: number;
  case_price_cents: number | null;
  hdcp_tax_profile: HdcpTaxProfile;
  hdcp_tax_value: number | string;
};

export async function GET() {
  const staff = await getStaffIdentity();
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 });
  const database = await getDatabase();
  const repFilter = staff.role === "SALES_REP";
  const [profile, customers, products, reps, invoices] = await Promise.all([
    repFilter
      ? database.query(
          "SELECT commission_rate_bps,custom_pricing_enabled FROM sales_rep_profiles WHERE user_id=$1",
          [staff.id],
        )
      : Promise.resolve({ rows: [{ commission_rate_bps: 0, custom_pricing_enabled: true }] }),
    database.query(
      `SELECT o.id,o.display_name,owner.email,owner.display_name AS contact_name
         FROM organizations o
         JOIN LATERAL (
           SELECT u.email,u.display_name FROM organization_memberships m
           JOIN users u ON u.id=m.user_id AND u.system_role='BUYER'
           WHERE m.organization_id=o.id
           ORDER BY CASE WHEN m.membership_role='OWNER' THEN 0 ELSE 1 END,m.created_at LIMIT 1
         ) owner ON TRUE
        WHERE o.organization_type='WHOLESALE_BUYER' AND o.status='APPROVED'
          AND ($1::boolean=FALSE OR EXISTS (
            SELECT 1 FROM sales_rep_customer_assignments a
            WHERE a.sales_rep_user_id=$2 AND a.organization_id=o.id
          ))
        ORDER BY o.display_name`,
      [repFilter, staff.id],
    ),
    database.query<CatalogRow>(catalogQuery),
    repFilter
      ? Promise.resolve({ rows: [] })
      : database.query(
          `SELECT u.id,u.display_name,COALESCE(p.commission_rate_bps,0)::int AS commission_rate_bps
             FROM users u LEFT JOIN sales_rep_profiles p ON p.user_id=u.id
            WHERE u.system_role='SALES_REP' AND u.status='ACTIVE' ORDER BY u.display_name`,
        ),
    database.query(
      `SELECT r.id,r.order_number,r.invoice_status,r.invoice_issued_at,r.invoice_expires_at,
              r.estimated_total_cents,r.payment_status,r.commission_rate_bps,
              r.commission_earned_cents,o.display_name AS customer,rep.display_name AS sales_rep,
              CURRENT_TIMESTAMP<r.invoice_expires_at AND r.invoice_status<>'VOID' AS invoice_available
         FROM order_requests r JOIN organizations o ON o.id=r.organization_id
         LEFT JOIN users rep ON rep.id=r.sales_rep_user_id
        WHERE r.order_source='MANUAL_INVOICE'
          AND ($1::boolean=FALSE OR r.sales_rep_user_id=$2)
        ORDER BY r.submitted_at DESC LIMIT 200`,
      [repFilter, staff.id],
    ),
  ]);
  return NextResponse.json({
    ok: true,
    role: staff.role,
    profile: profile.rows[0] ?? { commission_rate_bps: 0, custom_pricing_enabled: false },
    customers: customers.rows,
    products: products.rows,
    reps: reps.rows,
    invoices: invoices.rows,
  });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const staff = await getStaffIdentity();
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Review the invoice details." }, { status: 422 });
  const database = await getDatabase();
  if (parsed.data.action === "void") {
    const scope = staff.role === "SALES_REP" ? "AND sales_rep_user_id=$2" : "";
    const result = await database.query(
      `UPDATE order_requests SET invoice_status='VOID',state='DECLINED',updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND order_source='MANUAL_INVOICE' AND payment_status='UNPAID'
          AND invoice_status='ISSUED' ${scope} RETURNING id`,
      staff.role === "SALES_REP" ? [parsed.data.id, staff.id] : [parsed.data.id],
    );
    if (!result.rows[0])
      return NextResponse.json({ ok: false, message: "Only an unpaid, issued invoice can be voided." }, { status: 422 });
    return NextResponse.json({ ok: true });
  }

  const data = parsed.data;
  const customer = await database.query<{ id: string; email: string; buyer_user_id: string }>(
    `SELECT o.id,owner.email,owner.id AS buyer_user_id FROM organizations o
       JOIN LATERAL (
         SELECT u.id,u.email FROM organization_memberships m JOIN users u ON u.id=m.user_id
         WHERE m.organization_id=o.id AND u.system_role='BUYER'
         ORDER BY CASE WHEN m.membership_role='OWNER' THEN 0 ELSE 1 END,m.created_at LIMIT 1
       ) owner ON TRUE
      WHERE o.id=$1 AND o.organization_type='WHOLESALE_BUYER' AND o.status='APPROVED'`,
    [data.customerId],
  );
  if (!customer.rows[0])
    return NextResponse.json({ ok: false, message: "Choose an approved customer." }, { status: 422 });

  const salesRepId: string | null = staff.role === "SALES_REP" ? staff.id : data.salesRepId ?? null;
  let commissionRateBps = 0;
  let customPricingEnabled = staff.role !== "SALES_REP";
  if (salesRepId) {
    const rep = await database.query<{ commission_rate_bps: number; custom_pricing_enabled: boolean; assigned: boolean }>(
      `SELECT COALESCE(p.commission_rate_bps,0)::int AS commission_rate_bps,
              COALESCE(p.custom_pricing_enabled,FALSE) AS custom_pricing_enabled,
              EXISTS (SELECT 1 FROM sales_rep_customer_assignments a WHERE a.sales_rep_user_id=u.id AND a.organization_id=$2) AS assigned
         FROM users u LEFT JOIN sales_rep_profiles p ON p.user_id=u.id
        WHERE u.id=$1 AND u.system_role='SALES_REP' AND u.status='ACTIVE'`,
      [salesRepId, data.customerId],
    );
    if (!rep.rows[0] || (staff.role === "SALES_REP" && !rep.rows[0].assigned))
      return NextResponse.json({ ok: false, message: "This customer is not assigned to the sales representative." }, { status: 403 });
    commissionRateBps = rep.rows[0].commission_rate_bps;
    customPricingEnabled = staff.role === "SALES_REP" ? rep.rows[0].custom_pricing_enabled : true;
  }

  const ids = [...new Set(data.items.map((item) => item.variantId))];
  const catalog = await database.query<CatalogRow>(`${catalogQuery} AND v.id = ANY($1::text[])`, [ids]);
  const byId = new Map(catalog.rows.map((row) => [row.variant_id, row]));
  if (byId.size !== ids.length)
    return NextResponse.json({ ok: false, message: "A selected product is no longer available." }, { status: 422 });

  if (data.items.some((item) => item.customCasePriceCents != null) && !customPricingEnabled)
    return NextResponse.json({ ok: false, message: "Custom pricing is not enabled for this sales representative." }, { status: 403 });
  if (data.items.some((item) => byId.get(item.variantId)!.case_price_cents === null && item.customCasePriceCents == null))
    return NextResponse.json({ ok: false, message: "A selected item requires a case price." }, { status: 422 });

  const priced = data.items.map((item) => {
    const product = byId.get(item.variantId)!;
    const price = item.customCasePriceCents ?? product.case_price_cents!;
    const tax = calculateHdcpTax({
      profile: product.hdcp_tax_profile,
      value: Number(product.hdcp_tax_value),
      unitsPerCase: product.units_per_case,
      quantityCases: item.quantity,
      casePriceCents: price,
    });
    return { item, product, price, tax };
  });
  const subtotalCents = priced.reduce((sum, row) => sum + row.tax.lineSubtotalCents, 0);
  const hdcpTaxCents = priced.reduce((sum, row) => sum + row.tax.totalTaxCents, 0);
  const totalCents = subtotalCents + hdcpTaxCents + data.shippingCents;
  if (totalCents < 1)
    return NextResponse.json({ ok: false, message: "The invoice total must be greater than zero." }, { status: 422 });

  const id = `request_${randomUUID()}`;
  const orderNumber = `HF-INV-${randomBytes(4).toString("hex").toUpperCase()}`;
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO order_requests (
         id,order_number,organization_id,buyer_user_id,state,fulfillment_method,contact_email,
         purchase_order_number,subtotal_cents,hdcp_tax_cents,shipping_cents,estimated_total_cents,
         pricing_pending,idempotency_key,payment_status,payment_provider,order_source,created_by_user_id,
         sales_rep_user_id,invoice_status,invoice_issued_at,invoice_expires_at,invoice_notes,commission_rate_bps
       ) VALUES ($1,$2,$3,$4,'READY_FOR_CHECKOUT',$5,$6,NULLIF($7,''),$8,$9,$10,$11,FALSE,$12,
         'UNPAID','AUTHORIZE_NET','MANUAL_INVOICE',$13,$14,'ISSUED',CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP+INTERVAL '30 days',NULLIF($15,''),$16)`,
      [id, orderNumber, data.customerId, customer.rows[0].buyer_user_id, data.fulfillmentMethod,
        customer.rows[0].email, data.purchaseOrder, subtotalCents, hdcpTaxCents, data.shippingCents,
        totalCents, randomUUID(), staff.id, salesRepId, data.notes, commissionRateBps],
    );
    for (const row of priced) {
      await transaction.query(
        `INSERT INTO order_request_items (
           id,order_request_id,catalog_product_id,product_name_snapshot,quantity_cases,case_price_cents,
           line_subtotal_cents,hdcp_tax_profile,hdcp_tax_value,hdcp_tax_cents,hdcp_tax_snapshot_json,product_snapshot_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [randomUUID(), id, `${row.product.product_id}:${row.product.variant_id}`,
          `${row.product.product_name} — ${row.product.variant_name}`, row.item.quantity, row.price,
          row.tax.lineSubtotalCents, row.tax.profile, row.tax.configuredValue, row.tax.totalTaxCents,
          row.tax, { productId: row.product.product_id, variantId: row.product.variant_id,
            regularCasePriceCents: row.product.case_price_cents, customPrice: row.item.customCasePriceCents != null }],
      );
    }
    await transaction.query(
      `INSERT INTO audit_events (id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json)
       VALUES ($1,$2,$3,'MANUAL_INVOICE_ISSUED','ORDER_REQUEST',$4,$5)`,
      [randomUUID(), staff.id, data.customerId, id, { orderNumber, totalCents, salesRepId }],
    );
    await queueAndSendEmail(transaction, {
      templateKey: "manual_invoice_issued",
      recipient: customer.rows[0].email,
      subject: `HiFive invoice ${orderNumber}`,
      text: `HiFive Supply issued invoice ${orderNumber} for $${(totalCents / 100).toFixed(2)}. Sign in to your buyer account to review and pay it within 30 days: ${publicOrigin(request)}/account`,
    });
  });
  return NextResponse.json({ ok: true, invoice: { id, orderNumber, totalCents } }, { status: 201 });
}

const catalogQuery = `SELECT v.id AS variant_id,p.id AS product_id,p.name AS product_name,
  v.variant_name,COALESCE(v.units_per_case,1)::int AS units_per_case,
  COALESCE(s.sale_price_cents,v.wholesale_price_cents) AS case_price_cents,
  COALESCE(v.hdcp_tax_profile,p.hdcp_tax_profile)::text AS hdcp_tax_profile,
  COALESCE(v.hdcp_tax_value,p.hdcp_tax_value)::numeric AS hdcp_tax_value
  FROM product_variants v JOIN products p ON p.id=v.product_id
  LEFT JOIN LATERAL (SELECT sale_price_cents FROM product_variant_sales s
    WHERE s.product_variant_id=v.id AND s.canceled_at IS NULL
      AND s.starts_at<=CURRENT_TIMESTAMP AND s.ends_at>CURRENT_TIMESTAMP
    ORDER BY s.starts_at DESC LIMIT 1) s ON TRUE
  WHERE p.status='PUBLISHED' AND v.online_sellable=TRUE`;

function publicOrigin(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");
}

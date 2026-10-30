import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { generateInvoicePdf } from "@/lib/server/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVOICE_RETENTION_DAYS = 30;

type InvoiceOrder = {
  order_number: string;
  submitted_at: Date | string;
  contact_email: string;
  purchase_order_number: string | null;
  fulfillment_method: string;
  estimated_total_cents: number | null;
  subtotal_cents: number;
  hdcp_tax_cents: number;
  sales_tax_cents: number;
  shipping_cents: number;
  payment_status: string;
  amount_paid_cents: number;
  amount_refunded_cents: number;
  payment_provider_reference: string | null;
  company_name: string;
  contact_name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
};

type InvoiceItem = {
  product_name_snapshot: string;
  quantity_cases: number;
  case_price_cents: number | null;
  hdcp_tax_cents: number;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { orderId } = await context.params;
  const database = await getDatabase();
  const [orderResult, itemsResult] = await Promise.all([
    database.query<InvoiceOrder>(
      `SELECT r.order_number,r.submitted_at,r.contact_email,r.purchase_order_number,
              r.fulfillment_method,r.estimated_total_cents,r.subtotal_cents,
              r.hdcp_tax_cents,r.sales_tax_cents,r.shipping_cents,r.payment_status,
              r.amount_paid_cents,r.amount_refunded_cents,r.payment_provider_reference,
              o.display_name AS company_name,owner.display_name AS contact_name,
              location.line1,location.line2,location.city,location.region,location.postal_code
         FROM order_requests r
         JOIN organizations o ON o.id=r.organization_id
         LEFT JOIN LATERAL (
           SELECT u.display_name FROM organization_memberships m
           JOIN users u ON u.id=m.user_id AND u.system_role='BUYER'
           WHERE m.organization_id=o.id
           ORDER BY CASE WHEN m.membership_role='OWNER' THEN 0 ELSE 1 END,m.created_at
           LIMIT 1
         ) owner ON TRUE
         LEFT JOIN LATERAL (
           SELECT line1,line2,city,region,postal_code FROM customer_locations
           WHERE organization_id=o.id
           ORDER BY is_primary DESC,created_at
           LIMIT 1
         ) location ON TRUE
        WHERE r.id=$1`,
      [orderId],
    ),
    database.query<InvoiceItem>(
      `SELECT product_name_snapshot,quantity_cases,case_price_cents,hdcp_tax_cents
         FROM order_request_items WHERE order_request_id=$1 ORDER BY created_at`,
      [orderId],
    ),
  ]);

  const order = orderResult.rows[0];
  if (!order) {
    return NextResponse.json(
      { ok: false, message: "Order not found." },
      { status: 404 },
    );
  }

  const submittedAt = new Date(order.submitted_at);
  const expiresAt = new Date(
    submittedAt.getTime() + INVOICE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  if (Date.now() >= expiresAt.getTime()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "This internal invoice has passed the 30-day retention period and is no longer available. The underlying order and payment history remain in reporting.",
      },
      { status: 410 },
    );
  }

  const address = [
    order.line1,
    order.line2,
    [order.city, order.region].filter(Boolean).join(", ") +
      (order.postal_code ? ` ${order.postal_code}` : ""),
  ].filter((line): line is string => Boolean(line?.trim()));
  const pdf = generateInvoicePdf({
    orderNumber: order.order_number,
    submittedAt,
    expiresAt,
    companyName: order.company_name,
    contactName: order.contact_name ?? "",
    contactEmail: order.contact_email,
    purchaseOrderNumber: order.purchase_order_number,
    fulfillmentMethod: order.fulfillment_method,
    paymentStatus: order.payment_status,
    paymentReference: order.payment_provider_reference,
    estimatedTotalCents: order.estimated_total_cents,
    subtotalCents: order.subtotal_cents,
    hdcpTaxCents: order.hdcp_tax_cents,
    salesTaxCents: order.sales_tax_cents,
    shippingCents: order.shipping_cents,
    amountPaidCents: order.amount_paid_cents,
    amountRefundedCents: order.amount_refunded_cents,
    address,
    items: itemsResult.rows.map((item) => ({
      name: item.product_name_snapshot,
      quantityCases: item.quantity_cases,
      casePriceCents: item.case_price_cents,
      hdcpTaxCents: item.hdcp_tax_cents,
    })),
  });
  const filename = `HiFive-invoice-${order.order_number.replace(/[^A-Za-z0-9-]/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Invoice-Expires-At": expiresAt.toISOString(),
    },
  });
}

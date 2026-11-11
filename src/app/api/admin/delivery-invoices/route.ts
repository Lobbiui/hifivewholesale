import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({
  orderId: z.string().min(1).max(200),
  shippingCents: z.number().int().min(0).max(10_000_000),
  notes: z.string().trim().max(4000).default(""),
}).strict();

type IssuedInvoice = {
  id: string;
  order_number: string;
  contact_email: string;
  organization_id: string;
  estimated_total_cents: number;
};

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Enter a valid delivery charge." },
      { status: 422 },
    );
  }

  const database = await getDatabase();
  const issued = await database.transaction(async (transaction) => {
    const updated = await transaction.query<IssuedInvoice>(
      `UPDATE order_requests
          SET order_source='MANUAL_INVOICE',created_by_user_id=$2,
              state='READY_FOR_CHECKOUT',shipping_cents=$3,
              estimated_total_cents=subtotal_cents+hdcp_tax_cents+sales_tax_cents+$3,
              pricing_pending=FALSE,payment_status='UNPAID',payment_provider='AUTHORIZE_NET',
              invoice_status='ISSUED',invoice_issued_at=CURRENT_TIMESTAMP,
              invoice_expires_at=CURRENT_TIMESTAMP+INTERVAL '30 days',
              invoice_notes=NULLIF($4,''),updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND fulfillment_method='DELIVERY'
          AND order_source='BUYER_CHECKOUT' AND payment_status='UNPAID'
          AND state NOT IN ('CONVERTED','DECLINED')
      RETURNING id,order_number,contact_email,organization_id,estimated_total_cents`,
      [parsed.data.orderId, admin.id, parsed.data.shippingCents, parsed.data.notes],
    );
    const invoice = updated.rows[0];
    if (!invoice) return null;
    await transaction.query(
      `INSERT INTO audit_events (
         id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json
       ) VALUES ($1,$2,$3,'DELIVERY_INVOICE_ISSUED','ORDER_REQUEST',$4,$5)`,
      [randomUUID(), admin.id, invoice.organization_id, invoice.id, {
        shippingCents: parsed.data.shippingCents,
        totalCents: invoice.estimated_total_cents,
      }],
    );
    await queueAndSendEmail(transaction, {
      templateKey: "delivery_invoice_issued",
      recipient: invoice.contact_email,
      subject: `HiFive delivery invoice ${invoice.order_number}`,
      text: `HiFive Supply finalized delivery and issued invoice ${invoice.order_number} for $${(invoice.estimated_total_cents / 100).toFixed(2)}. Sign in to your buyer account to review and pay it within 30 days: ${publicOrigin(request)}/account`,
    });
    return invoice;
  });

  if (!issued) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Only an unpaid delivery quote can be converted into an invoice. Refresh the order before trying again.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      invoice: {
        id: issued.id,
        orderNumber: issued.order_number,
        totalCents: issued.estimated_total_cents,
      },
    },
    { status: 201 },
  );
}

function publicOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin
  ).replace(/\/$/, "");
}

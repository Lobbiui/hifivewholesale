import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { canProcessAuthorizeNetFor, chargeAuthorizeNet, type AuthorizeNetResult } from "@/lib/server/authorize-net";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({
  idempotencyKey: z.string().uuid(),
  opaqueData: z.object({
    dataDescriptor: z.string().min(1).max(128),
    dataValue: z.string().min(20).max(4096),
  }).strict(),
}).strict();

type Invoice = {
  id: string;
  order_number: string;
  organization_id: string;
  contact_email: string;
  purchase_order_number: string | null;
  estimated_total_cents: number;
  invoice_expires_at: Date | string;
  invoice_status: string;
  payment_status: string;
  commission_rate_bps: number;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const buyer = await getBuyerIdentity();
  if (!buyer) return NextResponse.json({ ok: false, message: "Buyer sign-in is required." }, { status: 401 });
  if (buyer.mustChangePassword)
    return NextResponse.json({ ok: false, message: "Change the temporary password before paying." }, { status: 403 });
  if (!canProcessAuthorizeNetFor(buyer.email))
    return NextResponse.json({ ok: false, message: "Online payment is not enabled yet." }, { status: 503 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "The payment information is invalid." }, { status: 422 });
  const { id } = await context.params;
  const database = await getDatabase();

  const duplicate = await database.query<{ status: string; provider_transaction_id: string | null; response_message: string | null }>(
    "SELECT status,provider_transaction_id,response_message FROM payment_transactions WHERE idempotency_key=$1",
    [parsed.data.idempotencyKey],
  );
  if (duplicate.rows[0]) {
    const approved = ["APPROVED", "HELD"].includes(duplicate.rows[0].status);
    return NextResponse.json(
      { ok: approved, duplicate: true, message: approved ? "This invoice payment was already received." : duplicate.rows[0].response_message || "Start a new payment attempt." },
      { status: approved ? 200 : 409 },
    );
  }

  const found = await database.query<Invoice>(
    `SELECT id,order_number,organization_id,contact_email,purchase_order_number,
            estimated_total_cents,invoice_expires_at,invoice_status,payment_status,commission_rate_bps
       FROM order_requests
      WHERE id=$1 AND buyer_user_id=$2 AND organization_id=$3 AND order_source='MANUAL_INVOICE'`,
    [id, buyer.id, buyer.organizationId],
  );
  const invoice = found.rows[0];
  if (!invoice) return NextResponse.json({ ok: false, message: "Invoice not found." }, { status: 404 });
  if (invoice.invoice_status !== "ISSUED" || invoice.payment_status !== "UNPAID")
    return NextResponse.json({ ok: false, message: "This invoice is not available for payment." }, { status: 422 });
  if (new Date(invoice.invoice_expires_at).getTime() <= Date.now())
    return NextResponse.json({ ok: false, message: "This invoice has expired. Contact HiFive for a new invoice." }, { status: 410 });

  const attemptId = `payment_${randomUUID()}`;
  try {
    await database.query(
      `INSERT INTO payment_transactions (id,order_request_id,operation,status,amount_cents,idempotency_key,initiated_by_user_id)
       VALUES ($1,$2,'CHARGE','PENDING',$3,$4,$5)`,
      [attemptId, invoice.id, invoice.estimated_total_cents, parsed.data.idempotencyKey, buyer.id],
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "A payment for this invoice is already processing. Refresh before trying again." },
      { status: 409 },
    );
  }
  let result: AuthorizeNetResult;
  try {
    result = await chargeAuthorizeNet({
      amountCents: invoice.estimated_total_cents,
      dataDescriptor: parsed.data.opaqueData.dataDescriptor,
      dataValue: parsed.data.opaqueData.dataValue,
      orderNumber: invoice.order_number,
      description: `HiFive invoice ${invoice.order_number}`,
      purchaseOrder: invoice.purchase_order_number ?? "",
      customerId: invoice.organization_id,
      customerEmail: invoice.contact_email,
    });
  } catch {
    result = { status: "ERROR", transactionId: null, responseCode: null, reasonCode: null,
      message: "Authorize.net communication failed.", authorizationCode: null, accountType: null,
      maskedAccountNumber: null };
  }
  await database.transaction(async (transaction) => {
    await transaction.query(
      `UPDATE payment_transactions SET status=$2,provider_transaction_id=$3,response_code=$4,
       response_reason_code=$5,response_message=$6,authorization_code=$7,account_type=$8,
       masked_account_number=$9,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [attemptId, result.status, result.transactionId, result.responseCode, result.reasonCode,
        result.message, result.authorizationCode, result.accountType, result.maskedAccountNumber],
    );
    const paymentStatus = result.status === "APPROVED" ? "PAID" : result.status === "HELD" ? "HELD" : "UNPAID";
    const state = result.status === "APPROVED" ? "CONVERTED" : result.status === "HELD" ? "PRICING_REVIEW" : "READY_FOR_CHECKOUT";
    await transaction.query(
      `UPDATE order_requests SET state=$2,payment_status=$3,
       amount_paid_cents=CASE WHEN $3='PAID' THEN estimated_total_cents ELSE 0 END,
       payment_provider_reference=$4,paid_at=CASE WHEN $3='PAID' THEN CURRENT_TIMESTAMP ELSE NULL END,
       invoice_status=CASE WHEN $3='PAID' THEN 'PAID' ELSE invoice_status END,
       commission_earned_cents=CASE WHEN $3='PAID' THEN ROUND(estimated_total_cents*commission_rate_bps/10000.0)::int ELSE 0 END,
       updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [invoice.id, state, paymentStatus, result.transactionId],
    );
    await transaction.query(
      `INSERT INTO audit_events (id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json)
       VALUES ($1,$2,$3,$4,'ORDER_REQUEST',$5,$6)`,
      [randomUUID(), buyer.id, buyer.organizationId, `MANUAL_INVOICE_PAYMENT_${result.status}`, invoice.id,
        { amountCents: invoice.estimated_total_cents, transactionId: result.transactionId }],
    );
  });
  const ok = result.status === "APPROVED" || result.status === "HELD";
  return NextResponse.json({ ok, message: result.status === "APPROVED" ? "Invoice paid and order confirmed." : result.status === "HELD" ? "The payment is being reviewed." : result.status === "DECLINED" ? "The payment was declined." : "The payment could not be confirmed." },
    { status: result.status === "APPROVED" ? 201 : result.status === "HELD" ? 202 : result.status === "DECLINED" ? 402 : 502 });
}

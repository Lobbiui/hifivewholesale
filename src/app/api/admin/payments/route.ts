import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getAuthorizeNetConfig, refundAuthorizeNet, voidAuthorizeNet } from "@/lib/server/authorize-net";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("VOID"), orderId: z.string().min(1).max(200) }).strict(),
  z
    .object({
      action: z.literal("REFUND"),
      orderId: z.string().min(1).max(200),
      amountCents: z.number().int().positive().max(100_000_000),
    })
    .strict(),
]);

type PaymentOrder = {
  id: string;
  order_number: string;
  payment_status: string;
  amount_paid_cents: number;
  amount_refunded_cents: number;
  provider_transaction_id: string | null;
};

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  if (!getAuthorizeNetConfig().configured)
    return NextResponse.json(
      { ok: false, message: "Authorize.net payment actions are disabled." },
      { status: 503 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "The payment action is invalid." },
      { status: 422 },
    );

  const database = await getDatabase();
  const orderResult = await database.query<PaymentOrder>(
    `SELECT r.id,r.order_number,r.payment_status,r.amount_paid_cents,
            r.amount_refunded_cents,
            (SELECT p.provider_transaction_id
               FROM payment_transactions p
              WHERE p.order_request_id=r.id AND p.operation='CHARGE'
                AND p.status='APPROVED' AND p.provider_transaction_id IS NOT NULL
              ORDER BY p.created_at DESC LIMIT 1) AS provider_transaction_id
       FROM order_requests r WHERE r.id=$1 FOR UPDATE`,
    [parsed.data.orderId],
  );
  const order = orderResult.rows[0];
  if (!order?.provider_transaction_id)
    return NextResponse.json(
      { ok: false, message: "No approved Authorize.net charge was found." },
      { status: 404 },
    );
  const available = order.amount_paid_cents - order.amount_refunded_cents;
  if (available < 1)
    return NextResponse.json(
      { ok: false, message: "No refundable balance remains." },
      { status: 422 },
    );
  const amountCents =
    parsed.data.action === "VOID" ? available : parsed.data.amountCents;
  if (amountCents > available)
    return NextResponse.json(
      { ok: false, message: "The refund exceeds the remaining paid balance." },
      { status: 422 },
    );

  const transactionId = `payment_${randomUUID()}`;
  const idempotencyKey = `${parsed.data.action.toLowerCase()}:${order.id}:${randomUUID()}`;
  try {
    await database.query(
      `INSERT INTO payment_transactions (
         id,order_request_id,operation,status,amount_cents,reference_transaction_id,
         idempotency_key,initiated_by_user_id
       ) VALUES ($1,$2,$3,'PENDING',$4,$5,$6,$7)`,
      [
        transactionId,
        order.id,
        parsed.data.action,
        amountCents,
        order.provider_transaction_id,
        idempotencyKey,
        admin.id,
      ],
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "A payment action for this order is already processing. Refresh before trying again.",
      },
      { status: 409 },
    );
  }

  let result;
  try {
    result =
      parsed.data.action === "VOID"
        ? await voidAuthorizeNet(order.provider_transaction_id)
        : await refundAuthorizeNet(order.provider_transaction_id, amountCents);
  } catch {
    result = {
      status: "ERROR" as const,
      transactionId: null,
      responseCode: null,
      reasonCode: null,
      message: "Authorize.net communication failed.",
      authorizationCode: null,
      accountType: null,
      maskedAccountNumber: null,
    };
  }

  await database.transaction(async (transaction) => {
    await transaction.query(
      `UPDATE payment_transactions
          SET status=$2,provider_transaction_id=$3,response_code=$4,
              response_reason_code=$5,response_message=$6,authorization_code=$7,
              account_type=$8,masked_account_number=$9,updated_at=CURRENT_TIMESTAMP
        WHERE id=$1`,
      [
        transactionId,
        result.status,
        result.transactionId,
        result.responseCode,
        result.reasonCode,
        result.message,
        result.authorizationCode,
        result.accountType,
        result.maskedAccountNumber,
      ],
    );
    if (result.status === "APPROVED") {
      if (parsed.data.action === "VOID") {
        await transaction.query(
          `UPDATE order_requests
              SET payment_status='VOIDED',amount_refunded_cents=amount_paid_cents,
                  updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [order.id],
        );
      } else {
        await transaction.query(
          `UPDATE order_requests
              SET amount_refunded_cents=amount_refunded_cents+$2,
                  payment_status=CASE
                    WHEN amount_refunded_cents+$2>=amount_paid_cents THEN 'REFUNDED'
                    ELSE 'PARTIALLY_REFUNDED' END,
                  updated_at=CURRENT_TIMESTAMP
            WHERE id=$1`,
          [order.id, amountCents],
        );
      }
    }
    await transaction.query(
      `INSERT INTO audit_events (
         id,actor_user_id,action,aggregate_type,aggregate_id,after_json
       ) VALUES ($1,$2,$3,'ORDER_REQUEST',$4,$5)`,
      [
        randomUUID(),
        admin.id,
        `AUTHORIZE_NET_${parsed.data.action}_${result.status}`,
        order.id,
        {
          amountCents,
          transactionId: result.transactionId,
          responseCode: result.responseCode,
        },
      ],
    );
  });

  if (result.status !== "APPROVED")
    return NextResponse.json(
      {
        ok: false,
        message:
          result.message ||
          `${parsed.data.action === "VOID" ? "Void" : "Refund"} was not approved.`,
      },
      { status: 422 },
    );
  return NextResponse.json({
    ok: true,
    message:
      parsed.data.action === "VOID"
        ? "The unsettled transaction was voided."
        : "The refund was submitted successfully.",
    transactionId: result.transactionId,
  });
}

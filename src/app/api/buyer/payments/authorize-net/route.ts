import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { chargeAuthorizeNet, getAuthorizeNetConfig, type AuthorizeNetResult } from "@/lib/server/authorize-net";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getStorefrontProductsByIds } from "@/lib/server/catalog";
import { getDatabase, type Database } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paymentSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(160),
            variantId: z.string().min(1).max(160).optional(),
            quantity: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    method: z.enum(["pickup", "delivery"]),
    contactEmail: z.string().trim().toLowerCase().email().max(254),
    purchaseOrder: z.string().trim().max(120),
    idempotencyKey: z.string().uuid(),
    opaqueData: z
      .object({
        dataDescriptor: z.string().min(1).max(128),
        dataValue: z.string().min(20).max(4096),
      })
      .strict(),
  })
  .strict();

type SavedAttempt = {
  id: string;
  order_request_id: string;
  order_number: string;
  status: string;
  amount_cents: number;
  provider_transaction_id: string | null;
  response_message: string | null;
};

type RequestedProduct = {
  id: string;
  variantId?: string;
  name: string;
  flavor: string;
  casePrice: number | null;
  [key: string]: unknown;
};

function statusCode(result: AuthorizeNetResult) {
  if (result.status === "APPROVED") return 201;
  if (result.status === "HELD") return 202;
  if (result.status === "DECLINED") return 402;
  return 502;
}

function publicMessage(result: AuthorizeNetResult) {
  if (result.status === "APPROVED") return "Payment approved and order confirmed.";
  if (result.status === "HELD")
    return "The payment is being reviewed. HiFive will contact you before fulfillment.";
  if (result.status === "DECLINED")
    return "The payment was declined. Check the card details or contact the issuing bank.";
  return "The payment result could not be confirmed. Do not submit again; contact HiFive so the transaction can be checked.";
}

async function existingAttempt(database: Database, idempotencyKey: string) {
  const result = await database.query<SavedAttempt>(
    `SELECT p.id,p.order_request_id,r.order_number,p.status,p.amount_cents,
            p.provider_transaction_id,p.response_message
       FROM payment_transactions p
       JOIN order_requests r ON r.id=p.order_request_id
      WHERE p.idempotency_key=$1`,
    [idempotencyKey],
  );
  return result.rows[0] ?? null;
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const buyer = await getBuyerIdentity();
  if (!buyer)
    return NextResponse.json(
      { ok: false, message: "Approved buyer access is required." },
      { status: 401 },
    );
  if (buyer.mustChangePassword)
    return NextResponse.json(
      { ok: false, message: "Change the temporary password before paying." },
      { status: 403 },
    );
  if (!getAuthorizeNetConfig().enabled)
    return NextResponse.json(
      { ok: false, message: "Online payment is not enabled yet." },
      { status: 503 },
    );

  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "Review the checkout information and try again." },
      { status: 422 },
    );

  const database = await getDatabase();
  const duplicate = await existingAttempt(database, parsed.data.idempotencyKey);
  if (duplicate) {
    if (duplicate.status === "APPROVED" || duplicate.status === "HELD")
      return NextResponse.json({
        ok: true,
        duplicate: true,
        order: {
          id: duplicate.order_request_id,
          orderNumber: duplicate.order_number,
          paymentStatus: duplicate.status,
          amount: duplicate.amount_cents / 100,
          transactionId: duplicate.provider_transaction_id,
        },
      });
    return NextResponse.json(
      {
        ok: false,
        message:
          duplicate.status === "PENDING"
            ? "This payment is already being processed. Do not submit it again."
            : duplicate.response_message || "Start a new payment attempt.",
      },
      { status: 409 },
    );
  }

  const products = await getStorefrontProductsByIds(
    parsed.data.items.map((item) => item.id),
  );
  const catalog = new Map(products.map((product) => [product.id, product]));
  const requested = parsed.data.items.map((item) => {
    const product = catalog.get(item.id);
    const variant = item.variantId
      ? product?.variants?.find((candidate) => candidate.id === item.variantId)
      : product?.variants?.[0];
    const resolved: RequestedProduct | undefined =
      product && variant
        ? {
            ...product,
            variantId: variant.id,
            flavor: variant.name,
            casePrice: variant.casePrice,
          }
        : product
          ? ({ ...product, variantId: undefined } as RequestedProduct)
          : undefined;
    return { product: resolved, quantity: item.quantity };
  });
  if (requested.some((item) => !item.product))
    return NextResponse.json(
      {
        ok: false,
        message:
          "A product or flavor is no longer available. Review the cart before paying.",
      },
      { status: 422 },
    );
  if (requested.some((item) => item.product!.casePrice === null))
    return NextResponse.json(
      {
        ok: false,
        message:
          "This order requires account pricing and cannot be charged online yet.",
      },
      { status: 422 },
    );

  const totalCents = requested.reduce(
    (sum, item) =>
      sum + Math.round(item.product!.casePrice! * 100) * item.quantity,
    0,
  );
  if (totalCents < 1)
    return NextResponse.json(
      { ok: false, message: "The order total must be greater than zero." },
      { status: 422 },
    );

  const orderId = `request_${randomUUID()}`;
  const orderNumber = `HF-${randomBytes(5).toString("hex").toUpperCase()}`;
  const attemptId = `payment_${randomUUID()}`;
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO order_requests (
         id,order_number,organization_id,buyer_user_id,state,fulfillment_method,
         contact_email,purchase_order_number,estimated_total_cents,pricing_pending,
         idempotency_key,payment_status,payment_provider
       ) VALUES ($1,$2,$3,$4,'READY_FOR_CHECKOUT',$5,$6,NULLIF($7,''),$8,FALSE,$9,'PENDING','AUTHORIZE_NET')`,
      [
        orderId,
        orderNumber,
        buyer.organizationId,
        buyer.id,
        parsed.data.method.toUpperCase(),
        parsed.data.contactEmail,
        parsed.data.purchaseOrder,
        totalCents,
        parsed.data.idempotencyKey,
      ],
    );
    for (const item of requested) {
      await transaction.query(
        `INSERT INTO order_request_items (
           id,order_request_id,catalog_product_id,product_name_snapshot,
           quantity_cases,case_price_cents,product_snapshot_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          orderId,
          `${item.product!.id}:${item.product!.variantId ?? "default"}`,
          `${item.product!.name} — ${item.product!.flavor}`,
          item.quantity,
          Math.round(item.product!.casePrice! * 100),
          item.product!,
        ],
      );
    }
    await transaction.query(
      `INSERT INTO payment_transactions (
         id,order_request_id,operation,status,amount_cents,idempotency_key,
         initiated_by_user_id
       ) VALUES ($1,$2,'CHARGE','PENDING',$3,$4,$5)`,
      [
        attemptId,
        orderId,
        totalCents,
        parsed.data.idempotencyKey,
        buyer.id,
      ],
    );
  });

  let result: AuthorizeNetResult;
  try {
    result = await chargeAuthorizeNet({
      amountCents: totalCents,
      dataDescriptor: parsed.data.opaqueData.dataDescriptor,
      dataValue: parsed.data.opaqueData.dataValue,
      orderNumber,
      description: `HiFive wholesale order ${orderNumber}`,
      purchaseOrder: parsed.data.purchaseOrder,
      customerId: buyer.organizationId,
      customerEmail: parsed.data.contactEmail,
    });
  } catch {
    result = {
      status: "ERROR",
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
        attemptId,
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
    const paymentStatus =
      result.status === "APPROVED"
        ? "PAID"
        : result.status === "HELD"
          ? "HELD"
          : result.status === "DECLINED"
            ? "DECLINED"
            : "FAILED";
    const orderState =
      result.status === "APPROVED"
        ? "CONVERTED"
        : result.status === "HELD"
          ? "PRICING_REVIEW"
          : "DECLINED";
    await transaction.query(
      `UPDATE order_requests
          SET state=$2,payment_status=$3,
              amount_paid_cents=CASE WHEN $3='PAID' THEN $4 ELSE 0 END,
              payment_provider_reference=$5,
              paid_at=CASE WHEN $3='PAID' THEN CURRENT_TIMESTAMP ELSE NULL END,
              updated_at=CURRENT_TIMESTAMP
        WHERE id=$1`,
      [orderId, orderState, paymentStatus, totalCents, result.transactionId],
    );
    if (result.status === "APPROVED" || result.status === "HELD") {
      await transaction.query(
        "UPDATE carts SET status='CONVERTED',updated_at=CURRENT_TIMESTAMP WHERE buyer_user_id=$1 AND status='ACTIVE'",
        [buyer.id],
      );
    }
    await transaction.query(
      `INSERT INTO audit_events (
         id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json
       ) VALUES ($1,$2,$3,$4,'ORDER_REQUEST',$5,$6)`,
      [
        randomUUID(),
        buyer.id,
        buyer.organizationId,
        `AUTHORIZE_NET_${result.status}`,
        orderId,
        {
          amountCents: totalCents,
          transactionId: result.transactionId,
          responseCode: result.responseCode,
        },
      ],
    );
  });

  return NextResponse.json(
    {
      ok: result.status === "APPROVED" || result.status === "HELD",
      message: publicMessage(result),
      order: {
        id: orderId,
        orderNumber,
        paymentStatus: result.status,
        amount: totalCents / 100,
        transactionId: result.transactionId,
      },
    },
    { status: statusCode(result) },
  );
}

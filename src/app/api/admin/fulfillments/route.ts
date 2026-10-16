import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fulfillmentSchema = z.object({
  orderId: z.string().min(1).max(200),
  method: z.enum(["UPS", "DIRECT_DELIVERY", "PICKUP"]),
  status: z.enum([
    "PROCESSING",
    "READY_TO_SHIP",
    "SHIPPED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "DELIVERY_EXCEPTION",
  ]),
  trackingNumber: z.string().trim().max(100).default(""),
  serviceLevel: z.string().trim().max(100).default(""),
  packageCount: z.number().int().min(1).max(999).default(1),
  shippingCost: z.number().min(0).max(1_000_000).nullable().default(null),
  estimatedDeliveryDate: z.string().trim().max(10).default(""),
  driverNotes: z.string().trim().max(4000).default(""),
  customerNotes: z.string().trim().max(2000).default(""),
}).strict();

type FulfillmentResult = {
  order_number: string;
  contact_email: string;
  customer: string;
  previous_status: string | null;
};

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = fulfillmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "Review the fulfillment details and try again." },
      { status: 422 },
    );

  const data = parsed.data;
  const trackingNumber = data.trackingNumber.replace(/\s+/g, "").toUpperCase();
  if (
    data.method === "UPS" &&
    ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(data.status) &&
    !trackingNumber
  ) {
    return NextResponse.json(
      { ok: false, message: "Enter the UPS tracking number before marking this shipment in transit." },
      { status: 422 },
    );
  }

  const trackingUrl = data.method === "UPS" && trackingNumber
    ? `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`
    : null;
  const database = await getDatabase();
  const result = await database.transaction(async (transaction) => {
    const order = await transaction.query<FulfillmentResult>(
      `SELECT r.order_number, r.contact_email, o.display_name AS customer,
              f.status AS previous_status
         FROM order_requests r
         JOIN organizations o ON o.id = r.organization_id
         LEFT JOIN order_fulfillments f ON f.order_request_id = r.id
        WHERE r.id = $1
        FOR UPDATE OF r`,
      [data.orderId],
    );
    const row = order.rows[0];
    if (!row) throw new Error("ORDER_NOT_FOUND");

    await transaction.query(
      `INSERT INTO order_fulfillments (
         id, order_request_id, method, status, tracking_number, tracking_url,
         service_level, package_count, shipping_cost_cents, estimated_delivery_date,
         shipped_at, delivered_at, driver_notes, customer_notes, created_by, updated_by
       ) VALUES (
         $1,$2,$3,$4,NULLIF($5,''),$6,NULLIF($7,''),$8,$9,NULLIF($10,'')::date,
         CASE WHEN $4 IN ('SHIPPED','OUT_FOR_DELIVERY','DELIVERED') THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $4 = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE NULL END,
         NULLIF($11,''),NULLIF($12,''),$13,$13
       )
       ON CONFLICT (order_request_id) DO UPDATE SET
         method = EXCLUDED.method,
         status = EXCLUDED.status,
         tracking_number = EXCLUDED.tracking_number,
         tracking_url = EXCLUDED.tracking_url,
         service_level = EXCLUDED.service_level,
         package_count = EXCLUDED.package_count,
         shipping_cost_cents = EXCLUDED.shipping_cost_cents,
         estimated_delivery_date = EXCLUDED.estimated_delivery_date,
         shipped_at = CASE
           WHEN EXCLUDED.status IN ('SHIPPED','OUT_FOR_DELIVERY','DELIVERED')
             THEN COALESCE(order_fulfillments.shipped_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         delivered_at = CASE
           WHEN EXCLUDED.status = 'DELIVERED'
             THEN COALESCE(order_fulfillments.delivered_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         driver_notes = EXCLUDED.driver_notes,
         customer_notes = EXCLUDED.customer_notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [
        randomUUID(),
        data.orderId,
        data.method,
        data.status,
        trackingNumber,
        trackingUrl,
        data.serviceLevel,
        data.packageCount,
        data.shippingCost === null ? null : Math.round(data.shippingCost * 100),
        data.estimatedDeliveryDate,
        data.driverNotes,
        data.customerNotes,
        admin.id,
      ],
    );
    await transaction.query(
      `INSERT INTO audit_events (
         id, actor_user_id, action, aggregate_type, aggregate_id, after_json
       ) VALUES ($1,$2,'FULFILLMENT_UPDATED','ORDER_REQUEST',$3,$4)`,
      [randomUUID(), admin.id, data.orderId, { ...data, trackingNumber, trackingUrl }],
    );
    return row;
  });

  const shouldNotify = result.previous_status !== data.status && [
    "SHIPPED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "DELIVERY_EXCEPTION",
  ].includes(data.status);
  let notification = "not_requested";
  if (shouldNotify) {
    const readableStatus = data.status.replaceAll("_", " ").toLowerCase();
    const trackingLine = trackingUrl
      ? `\nUPS tracking: ${trackingNumber}\n${trackingUrl}`
      : "";
    const email = await queueAndSendEmail(database, {
      templateKey: "fulfillment_status",
      to: result.contact_email,
      subject: `${result.order_number} — ${readableStatus}`,
      text: `Hi ${result.customer},\n\nYour HiFive Supply order ${result.order_number} is ${readableStatus}.${trackingLine}${data.customerNotes ? `\n\n${data.customerNotes}` : ""}\n\nHiFive Supply`,
    });
    notification = email.delivered ? "sent" : "queued";
    await database.query(
      "UPDATE order_fulfillments SET last_notified_status=$2 WHERE order_request_id=$1",
      [data.orderId, data.status],
    );
  }

  return NextResponse.json({ ok: true, notification });
}


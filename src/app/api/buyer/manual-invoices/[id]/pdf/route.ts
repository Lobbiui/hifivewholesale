import { NextResponse } from "next/server";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { createOrderInvoice } from "@/lib/server/order-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const buyer = await getBuyerIdentity();
  if (!buyer) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await context.params;
  const database = await getDatabase();
  const allowed = await database.query(
    "SELECT id FROM order_requests WHERE id=$1 AND buyer_user_id=$2 AND organization_id=$3 AND order_source='MANUAL_INVOICE'",
    [id, buyer.id, buyer.organizationId],
  );
  if (!allowed.rows[0]) return NextResponse.json({ ok: false }, { status: 404 });
  const invoice = await createOrderInvoice(database, id);
  if (!invoice) return NextResponse.json({ ok: false }, { status: 404 });
  if (invoice.expired)
    return NextResponse.json({ ok: false, message: "This invoice has expired. Contact HiFive for a new invoice." }, { status: 410 });
  return new NextResponse(new Uint8Array(invoice.pdf), {
    headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Invoice-Expires-At": invoice.expiresAt.toISOString() },
  });
}

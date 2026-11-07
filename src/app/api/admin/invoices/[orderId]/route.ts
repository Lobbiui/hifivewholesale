import { NextResponse } from "next/server";
import { getStaffIdentity } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { createOrderInvoice } from "@/lib/server/order-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const staff = await getStaffIdentity();
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 });
  const { orderId } = await context.params;
  const database = await getDatabase();
  if (staff.role === "SALES_REP") {
    const allowed = await database.query(
      "SELECT id FROM order_requests WHERE id=$1 AND sales_rep_user_id=$2",
      [orderId, staff.id],
    );
    if (!allowed.rows[0]) return NextResponse.json({ ok: false }, { status: 403 });
  }
  const invoice = await createOrderInvoice(database, orderId);
  if (!invoice) return NextResponse.json({ ok: false, message: "Order not found." }, { status: 404 });
  if (invoice.expired)
    return NextResponse.json({ ok: false, message: "This invoice has passed the 30-day retention period. The underlying order, payment, and commission history remains available." }, { status: 410 });
  return new NextResponse(new Uint8Array(invoice.pdf), {
    headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Invoice-Expires-At": invoice.expiresAt.toISOString() },
  });
}

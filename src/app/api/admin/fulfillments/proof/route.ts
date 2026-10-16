import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function GET(request: Request) {
  if (!await getAdminIdentity()) return NextResponse.json({ ok: false }, { status: 401 });
  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ ok: false }, { status: 422 });
  const result = await (await getDatabase()).query<{
    proof_filename: string | null;
    proof_content_type: string | null;
    proof_data: Buffer | null;
  }>(
    "SELECT proof_filename,proof_content_type,proof_data FROM order_fulfillments WHERE order_request_id=$1",
    [orderId],
  );
  const proof = result.rows[0];
  if (!proof?.proof_data || !proof.proof_filename)
    return NextResponse.json({ ok: false, message: "Proof of delivery was not found." }, { status: 404 });
  const filename = proof.proof_filename.replace(/[\r\n"\\/]/g, "_");
  return new NextResponse(new Uint8Array(proof.proof_data), {
    headers: {
      "Content-Type": proof.proof_content_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await request.formData();
  const orderId = z.string().min(1).max(200).safeParse(form.get("orderId"));
  const file = form.get("file");
  if (!orderId.success || !(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.has(file.type))
    return NextResponse.json(
      { ok: false, message: "Upload a PDF, JPG, or PNG proof of delivery up to 8 MB." },
      { status: 422 },
    );
  const database = await getDatabase();
  const updated = await database.query(
    `UPDATE order_fulfillments SET
       proof_filename=$2, proof_content_type=$3, proof_size_bytes=$4,
       proof_data=$5, proof_uploaded_at=CURRENT_TIMESTAMP,
       updated_by=$6, updated_at=CURRENT_TIMESTAMP
     WHERE order_request_id=$1`,
    [orderId.data, file.name.slice(0, 240), file.type, file.size, new Uint8Array(await file.arrayBuffer()), admin.id],
  );
  if (!updated.rowCount)
    return NextResponse.json({ ok: false, message: "Save fulfillment details before uploading proof." }, { status: 409 });
  await database.query(
    "INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id) VALUES ($1,$2,'DELIVERY_PROOF_UPLOADED','ORDER_REQUEST',$3)",
    [randomUUID(), admin.id, orderId.data],
  );
  return NextResponse.json({ ok: true, filename: file.name });
}

export async function DELETE(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const orderId = z.string().min(1).max(200).safeParse(new URL(request.url).searchParams.get("orderId"));
  if (!orderId.success) return NextResponse.json({ ok: false }, { status: 422 });
  const database = await getDatabase();
  await database.query(
    `UPDATE order_fulfillments SET
       proof_filename=NULL,proof_content_type=NULL,proof_size_bytes=NULL,
       proof_data=NULL,proof_uploaded_at=NULL,updated_by=$2,updated_at=CURRENT_TIMESTAMP
     WHERE order_request_id=$1`,
    [orderId.data, admin.id],
  );
  await database.query(
    "INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id) VALUES ($1,$2,'DELIVERY_PROOF_REMOVED','ORDER_REQUEST',$3)",
    [randomUUID(), admin.id, orderId.data],
  );
  return NextResponse.json({ ok: true });
}


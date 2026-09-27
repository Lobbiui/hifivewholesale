import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LicenseRow = { filename: string | null; content_type: string | null; data: Buffer | Uint8Array | null };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAdminIdentity();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await context.params;
  const database = await getDatabase();
  const result = await database.query<LicenseRow>(
    `SELECT tn_hdcp_license_filename AS filename, tn_hdcp_license_content_type AS content_type,
            tn_hdcp_license_data AS data FROM buyer_applications WHERE id = $1 LIMIT 1`,
    [id],
  );
  const license = result.rows[0];
  if (!license?.data || !license.filename) return NextResponse.json({ ok: false, message: "License document not found." }, { status: 404 });
  const filename = license.filename.replace(/[\r\n"\\/]/g, "_");
  return new NextResponse(new Uint8Array(license.data), { headers: {
    "Content-Type": license.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }});
}

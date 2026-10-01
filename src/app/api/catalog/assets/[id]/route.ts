import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const database = await getDatabase();
  const result = await database.query<{
    file_bytes: Buffer | Uint8Array;
    mime_type: string;
    filename: string;
  }>("SELECT file_bytes,mime_type,filename FROM product_assets WHERE id=$1", [
    id,
  ]);
  const asset = result.rows[0];
  if (!asset) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(new Uint8Array(asset.file_bytes), {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Disposition": `inline; filename="${asset.filename.replace(/[\"\r\n]/g, "")}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

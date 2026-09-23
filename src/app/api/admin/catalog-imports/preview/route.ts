import { NextResponse } from "next/server";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { parseCatalogImport } from "@/lib/server/catalog-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false, message: "Request origin was rejected." }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false, message: "Administrator access is required." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "Choose a CSV file." }, { status: 422 });
    const preview = parseCatalogImport(file.name, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({
      ok: true,
      preview: {
        importType: preview.importType,
        filename: preview.filename,
        rowCount: preview.rowCount,
        totalUnits: preview.totalUnits,
        zeroQuantityRows: preview.zeroQuantityRows,
        readyToPublish: preview.readyToPublish,
        drafts: preview.drafts,
        warnings: preview.warnings,
        rows: preview.rows.slice(0, 12).map((row) => ({ rowNumber: row.rowNumber, product: row.product.name, brand: row.product.brand, quantity: row.quantity, status: row.status })),
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "The CSV could not be read." }, { status: 422 });
  }
}

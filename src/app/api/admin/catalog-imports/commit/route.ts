import { NextResponse } from "next/server";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { commitCatalogImport, parseCatalogImport } from "@/lib/server/catalog-import";
import { getDatabase } from "@/lib/server/database";

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
    const result = await commitCatalogImport(await getDatabase(), preview, admin.id);
    return NextResponse.json({ ok: true, result: { ...result, filename: preview.filename, rowCount: preview.rowCount, totalUnits: preview.totalUnits, drafts: preview.drafts } }, { status: 201 });
  } catch (error) {
    console.error("Catalog import failed", error);
    const message = error instanceof Error && /^(Row|The CSV|Choose|Use either|A maximum)/.test(error.message) ? error.message : "The import could not be completed. No catalog changes were saved.";
    return NextResponse.json({ ok: false, message }, { status: 422 });
  }
}

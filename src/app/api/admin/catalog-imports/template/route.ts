import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = [
  "Inventory Match Name", "Product Name", "SKU", "UPC", "Brand", "Category", "Description", "Strength", "Flavor", "Format",
  "Units Per Case", "Wholesale Case Price", "Unit Price", "Quantity On Hand", "Image URL",
  "Additional Image URLs", "COA URL", "Brand Logo URL", "Source URL", "Color", "Accent", "Badge", "Status",
];
const example = [
  "Paste the exact Clover Product value here", "Example Product", "HF-EXAMPLE-001", "", "Example Brand", "THC Gummies", "Replace this row with the manufacturer-approved description.",
  "300mg", "Blue Razz", "20-count bag", "5", "", "", "0", "/catalog/example/product.png", "", "", "", "", "#39244d", "#b67cff", "", "Draft",
];

export async function GET() {
  if (!await getAdminIdentity()) return NextResponse.json({ ok: false }, { status: 401 });
  const csv = `${headers.map(quote).join(",")}\r\n${example.map(quote).join(",")}\r\n`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="Hi-Five_Catalog_Import_Template.csv"', "Cache-Control": "no-store" } });
}

function quote(value: string) { return `"${value.replaceAll('"', '""')}"`; }

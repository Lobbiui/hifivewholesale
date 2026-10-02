import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAdminIdentity,
  hasValidRequestOrigin,
} from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assetType = z.enum(["IMAGE", "COA"]);
const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const parsed = z
    .object({
      productId: z.string().min(1),
      variantId: z.string().min(1).optional(),
      assetType,
    })
    .safeParse({
      productId: form.get("productId"),
      variantId: form.get("variantId") || undefined,
      assetType: form.get("assetType"),
    });
  if (!parsed.success || !(file instanceof File))
    return NextResponse.json(
      { ok: false, message: "Choose a valid file." },
      { status: 422 },
    );
  if (
    !allowed.has(file.type) ||
    file.size > 8 * 1024 * 1024 ||
    (parsed.data.assetType === "IMAGE" && !file.type.startsWith("image/"))
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Use a JPG, PNG, WebP, or PDF no larger than 8 MB.",
      },
      { status: 422 },
    );
  }
  const database = await getDatabase();
  const id = randomUUID();
  const url = `/api/catalog/assets/${id}`;
  const column = parsed.data.assetType === "IMAGE" ? "image_urls" : "coa_urls";
  await database.transaction(async (tx) => {
    if (parsed.data.variantId) {
      const variant = await tx.query(
        "SELECT id FROM product_variants WHERE id=$1 AND product_id=$2",
        [parsed.data.variantId, parsed.data.productId],
      );
      if (!variant.rows[0])
        throw new Error("The shopper option was not found.");
    }
    await tx.query(
      "INSERT INTO product_assets (id,product_id,product_variant_id,asset_type,filename,mime_type,file_bytes,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        parsed.data.productId,
        parsed.data.variantId ?? null,
        parsed.data.assetType,
        file.name,
        file.type,
        Buffer.from(await file.arrayBuffer()),
        admin.id,
      ],
    );
    if (parsed.data.variantId)
      await tx.query(
        `UPDATE product_variants SET ${column}=${column}||$2::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [parsed.data.variantId, JSON.stringify([url])],
      );
    else
      await tx.query(
        `INSERT INTO product_catalog_details (product_id,${column}) VALUES ($1,$2::jsonb) ON CONFLICT (product_id) DO UPDATE SET ${column}=product_catalog_details.${column}||EXCLUDED.${column},updated_at=CURRENT_TIMESTAMP`,
        [parsed.data.productId, JSON.stringify([url])],
      );
  });
  return NextResponse.json({ ok: true, url }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  if (!(await getAdminIdentity()))
    return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 422 });
  const database = await getDatabase();
  const found = await database.query<{
    product_id: string;
    product_variant_id: string | null;
    asset_type: "IMAGE" | "COA";
  }>(
    "SELECT product_id,product_variant_id,asset_type FROM product_assets WHERE id=$1",
    [id],
  );
  const asset = found.rows[0];
  if (!asset) return NextResponse.json({ ok: false }, { status: 404 });
  const column = asset.asset_type === "IMAGE" ? "image_urls" : "coa_urls";
  const url = `/api/catalog/assets/${id}`;
  await database.transaction(async (tx) => {
    await tx.query("DELETE FROM product_assets WHERE id=$1", [id]);
    if (asset.product_variant_id)
      await tx.query(
        `UPDATE product_variants SET ${column}=COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements_text(${column}) value WHERE value <> $2),'[]'::jsonb),updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [asset.product_variant_id, url],
      );
    else
      await tx.query(
        `UPDATE product_catalog_details SET ${column}=COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements_text(${column}) value WHERE value <> $2),'[]'::jsonb),updated_at=CURRENT_TIMESTAMP WHERE product_id=$1`,
        [asset.product_id, url],
      );
  });
  return NextResponse.json({ ok: true });
}

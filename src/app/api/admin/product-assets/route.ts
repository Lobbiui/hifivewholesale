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
const mediaMutation = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("REORDER"),
    productId: z.string().min(1),
    variantId: z.string().min(1).optional(),
    assetType,
    urls: z.array(z.string().min(1).max(1000)).max(100),
  }),
  z.object({
    operation: z.literal("REMOVE"),
    productId: z.string().min(1),
    variantId: z.string().min(1).optional(),
    assetType,
    url: z.string().min(1).max(1000),
  }),
]);
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
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectMimeType(file.name, file.type, bytes);
  if (
    !mimeType ||
    file.size > 8 * 1024 * 1024 ||
    (parsed.data.assetType === "IMAGE" && !mimeType.startsWith("image/"))
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
        mimeType,
        Buffer.from(bytes),
        admin.id,
      ],
    );
    const mergeExpression =
      parsed.data.assetType === "IMAGE"
        ? `$2::jsonb||${column}`
        : `${column}||$2::jsonb`;
    if (parsed.data.variantId)
      await tx.query(
        `UPDATE product_variants SET ${column}=${mergeExpression},updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [parsed.data.variantId, JSON.stringify([url])],
      );
    else
      await tx.query(
        `INSERT INTO product_catalog_details (product_id,${column}) VALUES ($1,$2::jsonb) ON CONFLICT (product_id) DO UPDATE SET ${column}=${
          parsed.data.assetType === "IMAGE"
            ? `EXCLUDED.${column}||product_catalog_details.${column}`
            : `product_catalog_details.${column}||EXCLUDED.${column}`
        },updated_at=CURRENT_TIMESTAMP`,
        [parsed.data.productId, JSON.stringify([url])],
      );
  });
  return NextResponse.json({ ok: true, url }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  if (!(await getAdminIdentity()))
    return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = mediaMutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "The media change was not valid." },
      { status: 422 },
    );

  const database = await getDatabase();
  const data = parsed.data;
  const column = data.assetType === "IMAGE" ? "image_urls" : "coa_urls";
  const current = data.variantId
    ? await database.query<{ urls: unknown }>(
        `SELECT ${column} AS urls FROM product_variants WHERE id=$1 AND product_id=$2`,
        [data.variantId, data.productId],
      )
    : await database.query<{ urls: unknown }>(
        `SELECT ${column} AS urls FROM product_catalog_details WHERE product_id=$1`,
        [data.productId],
      );
  const existing = stringArray(current.rows[0]?.urls);
  if (!current.rows[0])
    return NextResponse.json(
      { ok: false, message: "The product media record was not found." },
      { status: 404 },
    );

  let next: string[];
  if (data.operation === "REORDER") {
    if (!sameMembers(existing, data.urls))
      return NextResponse.json(
        { ok: false, message: "Media changed while this page was open. Refresh and try again." },
        { status: 409 },
      );
    next = data.urls;
  } else {
    if (!existing.includes(data.url))
      return NextResponse.json(
        { ok: false, message: "That file is no longer attached to this product." },
        { status: 404 },
      );
    next = existing.filter((url) => url !== data.url);
  }

  await database.transaction(async (tx) => {
    if (data.variantId)
      await tx.query(
        `UPDATE product_variants SET ${column}=$2::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [data.variantId, JSON.stringify(next)],
      );
    else
      await tx.query(
        `UPDATE product_catalog_details SET ${column}=$2::jsonb,updated_at=CURRENT_TIMESTAMP WHERE product_id=$1`,
        [data.productId, JSON.stringify(next)],
      );

    if (data.operation === "REMOVE") {
      const storedId = storedAssetId(data.url);
      if (storedId)
        await tx.query(
          "DELETE FROM product_assets WHERE id=$1 AND product_id=$2 AND product_variant_id IS NOT DISTINCT FROM $3 AND asset_type=$4",
          [storedId, data.productId, data.variantId ?? null, data.assetType],
        );
    }
  });
  return NextResponse.json({ ok: true, urls: next });
}

function detectMimeType(filename: string, supplied: string, bytes: Uint8Array) {
  const signature = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (signature(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return "image/png";
  if (signature(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (signature(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (allowed.has(supplied)) return supplied;
  const extension = filename.toLowerCase().split(".").pop();
  return extension === "png"
    ? "image/png"
    : extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "webp"
        ? "image/webp"
        : extension === "pdf"
          ? "application/pdf"
          : null;
}

function stringArray(value: unknown) {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      return stringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function sameMembers(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function storedAssetId(url: string) {
  return /^\/api\/catalog\/assets\/([0-9a-f-]{36})$/i.exec(url)?.[1] ?? null;
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

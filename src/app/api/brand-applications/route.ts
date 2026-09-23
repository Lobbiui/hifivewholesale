import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";

export const runtime = "nodejs";
const schema = z.object({ brand: z.string().trim().min(2).max(160), contact: z.string().trim().min(2).max(160), email: z.string().trim().toLowerCase().email().max(254), website: z.string().trim().url().max(500), categories: z.string().trim().min(2).max(500), markets: z.string().trim().min(2).max(500), volume: z.string().trim().min(2).max(100), message: z.string().trim().min(10).max(4000) }).strict();

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Review the brand application fields." }, { status: 422 });
  const database = await getDatabase();
  const id = `brand_${randomUUID()}`;
  await database.query(
    `INSERT INTO brand_applications (id, brand_name, contact_name, email, website_url, categories, markets, monthly_volume, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, parsed.data.brand, parsed.data.contact, parsed.data.email, parsed.data.website, parsed.data.categories, parsed.data.markets, parsed.data.volume, parsed.data.message],
  );
  const notify = process.env.BRAND_APPLICATION_EMAIL?.trim() || process.env.CHAT_ADMIN_EMAIL?.trim();
  if (notify) await queueAndSendEmail(database, { templateKey: "brand_application", to: notify, subject: `New brand application: ${parsed.data.brand}`, text: `${parsed.data.contact} submitted ${parsed.data.brand}.\n\nEmail: ${parsed.data.email}\nWebsite: ${parsed.data.website}\nCategories: ${parsed.data.categories}\nMarkets: ${parsed.data.markets}\nVolume: ${parsed.data.volume}\n\n${parsed.data.message}` });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

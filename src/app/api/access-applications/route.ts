import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const applicationSchema = z.object({
  company: z.string().trim().min(2).max(160),
  contact: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(7).max(40),
  resaleId: z.string().trim().min(2).max(100),
  territory: z.string().trim().min(2).max(120),
  businessType: z.string().trim().min(2).max(80),
  website: z.union([z.literal(""), z.string().trim().url().max(500)]).optional().default(""),
  certified: z.literal(true),
}).strict();

type ApplicationRow = {
  id: string;
  status: "PENDING" | "APPROVED";
  submitted_at: Date | string;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The application could not be read." }, { status: 400 });
  }

  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Please review the required business information and try again." },
      { status: 422 },
    );
  }

  const application = parsed.data;
  try {
    const database = await getDatabase();
    const result = await database.query<ApplicationRow>(
      `
        INSERT INTO buyer_applications (
          id,
          legal_business_name,
          contact_name,
          business_email,
          business_phone,
          resale_id,
          primary_territory,
          business_type,
          website_url,
          certification_accepted_at,
          status,
          submitted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ((LOWER(business_email))) DO UPDATE SET
          legal_business_name = EXCLUDED.legal_business_name,
          contact_name = EXCLUDED.contact_name,
          business_phone = EXCLUDED.business_phone,
          resale_id = EXCLUDED.resale_id,
          primary_territory = EXCLUDED.primary_territory,
          business_type = EXCLUDED.business_type,
          website_url = EXCLUDED.website_url,
          certification_accepted_at = CURRENT_TIMESTAMP,
          status = CASE WHEN buyer_applications.status = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING' END,
          reviewed_at = CASE WHEN buyer_applications.status = 'APPROVED' THEN buyer_applications.reviewed_at ELSE NULL END,
          reviewed_by = CASE WHEN buyer_applications.status = 'APPROVED' THEN buyer_applications.reviewed_by ELSE NULL END,
          review_notes = CASE WHEN buyer_applications.status = 'APPROVED' THEN buyer_applications.review_notes ELSE NULL END,
          submitted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, status, submitted_at
      `,
      [
        `wa_${randomUUID()}`,
        application.company,
        application.contact,
        application.email,
        application.phone,
        application.resaleId,
        application.territory,
        application.businessType,
        application.website,
      ],
    );
    const saved = result.rows[0];

    return NextResponse.json(
      {
        ok: true,
        application: {
          id: saved.id,
          status: saved.status === "APPROVED" ? "Approved" : "Pending",
          submitted: new Date(saved.submitted_at).toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Unable to store wholesale application", error);
    return NextResponse.json(
      { ok: false, message: "We could not submit the application right now. Please try again shortly." },
      { status: 503 },
    );
  }
}

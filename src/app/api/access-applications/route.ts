import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/server/database";
import { isTennesseeTerritory } from "@/lib/us-states";

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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "The application could not be read." }, { status: 400 });
  }

  const parsed = applicationSchema.safeParse({
    company: form.get("company"), contact: form.get("contact"), email: form.get("email"),
    phone: form.get("phone"), resaleId: form.get("resaleId"), territory: form.get("territory"),
    businessType: form.get("businessType"), website: form.get("website") ?? "",
    certified: form.get("certified") === "on",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Please review the required business information and try again." },
      { status: 422 },
    );
  }

  const application = parsed.data;
  const submittedLicense = form.get("tnHdcpLicense");
  const license = submittedLicense instanceof File && submittedLicense.size > 0 ? submittedLicense : null;
  if (isTennesseeTerritory(application.territory) && !license) {
    return NextResponse.json({ ok: false, message: "A Tennessee HDCP license is required for Tennessee applicants." }, { status: 422 });
  }
  if (license && !["application/pdf", "image/jpeg", "image/png"].includes(license.type)) {
    return NextResponse.json({ ok: false, message: "Upload the TN HDCP license as a PDF, JPG, or PNG." }, { status: 422 });
  }
  if (license && license.size > 8 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "The TN HDCP license must be 8 MB or smaller." }, { status: 422 });
  }
  const licenseData = isTennesseeTerritory(application.territory) && license
    ? Buffer.from(await license.arrayBuffer())
    : null;
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
          tn_hdcp_license_filename,
          tn_hdcp_license_content_type,
          tn_hdcp_license_size_bytes,
          tn_hdcp_license_data,
          tn_hdcp_license_submitted_at,
          certification_accepted_at,
          status,
          submitted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11, $12, $13, CASE WHEN $13::BYTEA IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ((LOWER(business_email))) DO UPDATE SET
          legal_business_name = EXCLUDED.legal_business_name,
          contact_name = EXCLUDED.contact_name,
          business_phone = EXCLUDED.business_phone,
          resale_id = EXCLUDED.resale_id,
          primary_territory = EXCLUDED.primary_territory,
          business_type = EXCLUDED.business_type,
          website_url = EXCLUDED.website_url,
          tn_hdcp_license_filename = EXCLUDED.tn_hdcp_license_filename,
          tn_hdcp_license_content_type = EXCLUDED.tn_hdcp_license_content_type,
          tn_hdcp_license_size_bytes = EXCLUDED.tn_hdcp_license_size_bytes,
          tn_hdcp_license_data = EXCLUDED.tn_hdcp_license_data,
          tn_hdcp_license_submitted_at = EXCLUDED.tn_hdcp_license_submitted_at,
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
        licenseData ? license!.name.slice(0, 255) : null,
        licenseData ? license!.type : null,
        licenseData ? license!.size : null,
        licenseData,
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

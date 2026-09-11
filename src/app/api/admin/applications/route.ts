import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplicationRow = {
  id: string;
  legal_business_name: string;
  contact_name: string;
  business_email: string;
  business_phone: string;
  resale_id: string;
  primary_territory: string;
  business_type: string;
  website_url: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "MORE_INFO_REQUIRED";
  submitted_at: Date | string;
};

const displayStatus = (status: ApplicationRow["status"]) => status === "APPROVED" ? "Approved" : status === "DECLINED" ? "Declined" : "Pending";

export async function GET() {
  const user = await getAdminIdentity();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const database = await getDatabase();
  const result = await database.query<ApplicationRow>(
    `SELECT id, legal_business_name, contact_name, business_email, business_phone, resale_id,
            primary_territory, business_type, website_url, status, submitted_at
       FROM buyer_applications
      ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'MORE_INFO_REQUIRED' THEN 1 ELSE 2 END, submitted_at DESC`,
  );

  return NextResponse.json({
    ok: true,
    applications: result.rows.map((row) => ({
      id: row.id,
      company: row.legal_business_name,
      contact: row.contact_name,
      email: row.business_email,
      phone: row.business_phone,
      resaleId: row.resale_id,
      territory: row.primary_territory,
      businessType: row.business_type,
      website: row.website_url ?? undefined,
      status: displayStatus(row.status),
      submitted: new Date(row.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    })),
  });
}

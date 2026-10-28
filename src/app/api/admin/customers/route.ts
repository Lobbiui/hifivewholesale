import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { customerAccountRequestSchema } from "@/lib/customer-account-input";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { hashBuyerToken } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";
import { hashPassword } from "@/lib/server/passwords";
import { isTennesseeTerritory } from "@/lib/us-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = customerAccountRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Complete all required wholesale account fields." }, { status: 422 });

  const database = await getDatabase();
  const activationToken = randomBytes(32).toString("base64url");
  const activationUrl = `${publicOrigin(request)}/activate?token=${encodeURIComponent(activationToken)}`;

  try {
    const created = await database.transaction(async (transaction) => {
      if (parsed.data.action === "resend_activation") {
        const found = await transaction.query<{ user_id: string; email: string; display_name: string }>(
          `SELECT u.id AS user_id, u.email, u.display_name
             FROM organizations o
             JOIN organization_memberships m ON m.organization_id = o.id AND m.membership_role = 'OWNER'
             JOIN users u ON u.id = m.user_id AND u.system_role = 'BUYER'
            WHERE o.id = $1 AND o.organization_type = 'WHOLESALE_BUYER' AND u.status = 'INVITED'
            LIMIT 1`,
          [parsed.data.organizationId],
        );
        const buyer = found.rows[0];
        if (!buyer) throw new Error("Only invited buyer accounts can receive a new activation link.");
        await transaction.query(
          `UPDATE user_credentials SET reset_token_hash=$2, reset_token_expires_at=CURRENT_TIMESTAMP+INTERVAL '7 days',
             failed_attempts=0, locked_until=NULL WHERE user_id=$1`,
          [buyer.user_id, hashBuyerToken(activationToken)],
        );
        await transaction.query(
          `INSERT INTO audit_events (id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json)
           VALUES ($1,$2,$3,'BUYER_ACTIVATION_REISSUED','WHOLESALE_ACCOUNT',$3,$4)`,
          [randomUUID(), admin.id, parsed.data.organizationId, { email: buyer.email }],
        );
        return { organizationId: parsed.data.organizationId, email: buyer.email, contactName: buyer.display_name, companyName: "your business" };
      }

      if (isTennesseeTerritory(parsed.data.territory) && !parsed.data.tnLicenseVerified) {
        throw new Error("Confirm the TN HDCP license before creating a Tennessee wholesale account.");
      }
      const duplicate = await transaction.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(email)=LOWER($1)
         UNION ALL SELECT id FROM buyer_applications WHERE LOWER(business_email)=LOWER($1) LIMIT 1`,
        [parsed.data.email],
      );
      if (duplicate.rows[0]) throw new Error("An account with that email already exists.");
      if(parsed.data.setupMethod==="TEMPORARY_PASSWORD"&&!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,200}$/.test(parsed.data.temporaryPassword))throw new Error("Temporary passwords need at least 12 characters with a letter, number, and special character.");

      const organizationId = `org_${randomUUID()}`;
      const userId = `usr_${randomUUID()}`;
      const applicationId = `app_${randomUUID()}`;
      await transaction.query(
        `INSERT INTO organizations (id,legal_name,display_name,organization_type,status,resale_id,resale_document_status,primary_territory,website_url)
         VALUES ($1,$2,$2,'WHOLESALE_BUYER','APPROVED',NULLIF($3,''),CASE WHEN NULLIF($3,'') IS NULL THEN 'NOT_PROVIDED' ELSE 'PENDING' END,$4,$5)`,
        [organizationId, parsed.data.companyName, parsed.data.resaleId, parsed.data.territory, parsed.data.websiteUrl || null],
      );
      await transaction.query(
        `INSERT INTO users (id,email,display_name,system_role,status,must_change_password) VALUES ($1,$2,$3,'BUYER',$4,$5)`,
        [userId, parsed.data.email, parsed.data.contactName,parsed.data.setupMethod==="TEMPORARY_PASSWORD"?"ACTIVE":"INVITED",parsed.data.setupMethod==="TEMPORARY_PASSWORD"],
      );
      const credentialHash=parsed.data.setupMethod==="TEMPORARY_PASSWORD"?await hashPassword(parsed.data.temporaryPassword):"pending-activation";
      await transaction.query(
        `INSERT INTO user_credentials (user_id,password_hash,reset_token_hash,reset_token_expires_at)
         VALUES ($1,$2,$3,CASE WHEN $3 IS NULL THEN NULL ELSE CURRENT_TIMESTAMP+INTERVAL '7 days' END)`,
        [userId,credentialHash,parsed.data.setupMethod==="ACTIVATION_LINK"?hashBuyerToken(activationToken):null],
      );
      await transaction.query(
        `INSERT INTO organization_memberships (id,organization_id,user_id,membership_role) VALUES ($1,$2,$3,'OWNER')`,
        [randomUUID(), organizationId, userId],
      );
      await transaction.query(
        `INSERT INTO buyer_applications
          (id,legal_business_name,contact_name,business_email,business_phone,resale_id,primary_territory,business_type,website_url,
           certification_accepted_at,status,organization_id,reviewed_at,reviewed_by,review_notes)
         VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8,$9,CURRENT_TIMESTAMP,'APPROVED',$10,CURRENT_TIMESTAMP,$11,$12)`,
        [applicationId, parsed.data.companyName, parsed.data.contactName, parsed.data.email, parsed.data.phone, parsed.data.resaleId,
          parsed.data.territory, parsed.data.businessType, parsed.data.websiteUrl || null, organizationId, admin.id,
          isTennesseeTerritory(parsed.data.territory) ? "Manually created by administrator; TN HDCP license verified." : "Manually created by administrator."],
      );
      await transaction.query(
        "INSERT INTO loyalty_accounts (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING",
        [organizationId],
      );
      await transaction.query(
        `INSERT INTO audit_events (id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json)
         VALUES ($1,$2,$3,'WHOLESALE_ACCOUNT_CREATED','WHOLESALE_ACCOUNT',$3,$4)`,
        [randomUUID(), admin.id, organizationId, { email: parsed.data.email, contactName: parsed.data.contactName, status: parsed.data.setupMethod==="TEMPORARY_PASSWORD"?"ACTIVE":"INVITED",mustChangePassword:parsed.data.setupMethod==="TEMPORARY_PASSWORD",tnLicenseVerified: parsed.data.tnLicenseVerified }],
      );
      return { organizationId, email: parsed.data.email, contactName: parsed.data.contactName, companyName: parsed.data.companyName };
    });

    if(parsed.data.action==="create"&&parsed.data.setupMethod==="TEMPORARY_PASSWORD")return NextResponse.json({ok:true,organizationId:created.organizationId,emailDelivery:"not_sent",mustChangePassword:true},{status:201});
    let emailDelivery = "failed";
    try {
      const email = await queueAndSendEmail(database, {
        templateKey: "buyer_invitation",
        to: created.email,
        subject: "Activate your HiFive wholesale account",
        text: `Hello ${created.contactName},\n\n${created.companyName} has been approved for a HiFive wholesale account. Set your password within 7 days:\n\n${activationUrl}\n\nIf you did not expect this invitation, contact HiFive Supply.`,
      });
      emailDelivery = email.delivered ? "sent" : email.configurationRequired ? "configuration_required" : "failed";
    } catch {
      // The account and activation link remain valid if the optional email service is unavailable.
    }
    return NextResponse.json({ ok: true, organizationId: created.organizationId, activationUrl, emailDelivery }, { status: parsed.data.action === "create" ? 201 : 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const safeMessage = /already exists|TN HDCP|Only invited/i.test(detail) ? detail : "The wholesale account could not be created.";
    return NextResponse.json({ ok: false, message: safeMessage }, { status: 422 });
  }
}

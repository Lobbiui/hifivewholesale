import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { hashBuyerToken } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionSchema = z.object({ status: z.enum(["Approved", "Declined"]) }).strict();

type ApplicationRow = {
  id: string;
  legal_business_name: string;
  contact_name: string;
  business_email: string;
  resale_id: string;
  primary_territory: string;
  website_url: string | null;
  status: string;
  organization_id: string | null;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getAdminIdentity();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Choose a valid decision." }, { status: 400 });

  const { id } = await context.params;
  const activationToken = randomBytes(32).toString("base64url");
  const database = await getDatabase();
  const updated = await database.transaction(async (transaction) => {
    const existing = await transaction.query<ApplicationRow>(
      "SELECT id, legal_business_name, contact_name, business_email, resale_id, primary_territory, website_url, status, organization_id FROM buyer_applications WHERE id = $1 FOR UPDATE",
      [id],
    );
    const application = existing.rows[0];
    if (!application) return null;

    const nextStatus = parsed.data.status.toUpperCase();
    let organizationId = application.organization_id;
    if (nextStatus === "APPROVED" && !organizationId) {
      organizationId = `org_${randomUUID()}`;
      await transaction.query(
        `INSERT INTO organizations (id, legal_name, display_name, organization_type, status, resale_id, primary_territory, website_url)
         VALUES ($1, $2, $2, 'WHOLESALE_BUYER', 'APPROVED', $3, $4, $5)`,
        [organizationId, application.legal_business_name, application.resale_id, application.primary_territory, application.website_url],
      );
    }
    if (nextStatus === "APPROVED" && organizationId) {
      await transaction.query("UPDATE organizations SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [organizationId]);
    }

    let includeActivationLink = false;
    if (nextStatus === "APPROVED" && organizationId) {
      const existingUser = await transaction.query<{ id: string; system_role: string; status: string }>(
        "SELECT id, system_role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [application.business_email],
      );
      const buyerUser = existingUser.rows[0];
      if (buyerUser && buyerUser.system_role !== "BUYER") {
        throw new Error("The application email already belongs to an administrator account.");
      }
      const buyerUserId = buyerUser?.id ?? `usr_${randomUUID()}`;
      if (!buyerUser) {
        await transaction.query(
          `INSERT INTO users (id, email, display_name, system_role, status)
           VALUES ($1, LOWER($2), $3, 'BUYER', 'INVITED')`,
          [buyerUserId, application.business_email, application.contact_name],
        );
      }
      await transaction.query(
        `INSERT INTO organization_memberships (id, organization_id, user_id, membership_role)
         VALUES ($1, $2, $3, 'OWNER') ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [randomUUID(), organizationId, buyerUserId],
      );
      if (!buyerUser || buyerUser.status !== "ACTIVE") {
        includeActivationLink = true;
        await transaction.query("UPDATE users SET status = 'INVITED', display_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [buyerUserId, application.contact_name]);
        await transaction.query(
          `INSERT INTO user_credentials (user_id, password_hash, reset_token_hash, reset_token_expires_at)
           VALUES ($1, 'pending-activation', $2, CURRENT_TIMESTAMP + INTERVAL '7 days')
           ON CONFLICT (user_id) DO UPDATE SET reset_token_hash = EXCLUDED.reset_token_hash,
             reset_token_expires_at = EXCLUDED.reset_token_expires_at, failed_attempts = 0, locked_until = NULL`,
          [buyerUserId, hashBuyerToken(activationToken)],
        );
      }
    }

    if (nextStatus === "DECLINED" && organizationId) {
      await transaction.query("UPDATE organizations SET status = 'DECLINED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [organizationId]);
      await transaction.query(
        `UPDATE users SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP
          WHERE id IN (SELECT user_id FROM organization_memberships WHERE organization_id = $1) AND system_role = 'BUYER'`,
        [organizationId],
      );
      await transaction.query(
        `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
          WHERE user_id IN (SELECT user_id FROM organization_memberships WHERE organization_id = $1) AND revoked_at IS NULL`,
        [organizationId],
      );
    }

    await transaction.query(
      `UPDATE buyer_applications
          SET status = $2, organization_id = $3, reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id, nextStatus, organizationId, user.id],
    );
    await transaction.query(
      `INSERT INTO audit_events (id, actor_user_id, organization_id, action, aggregate_type, aggregate_id, before_json, after_json)
       VALUES ($1, $2, $3, 'BUYER_APPLICATION_DECISION', 'buyer_application', $4, $5, $6)`,
      [
        randomUUID(), user.id, organizationId, id,
        { status: application.status },
        { status: nextStatus },
      ],
    );
    return { id, status: parsed.data.status, includeActivationLink };
  });

  if (!updated) return NextResponse.json({ ok: false, message: "Application not found." }, { status: 404 });
  const activationUrl = updated.includeActivationLink
    ? new URL(`/activate?token=${encodeURIComponent(activationToken)}`, request.url).toString()
    : undefined;
  return NextResponse.json({ ok: true, application: { id: updated.id, status: updated.status }, activationUrl });
}

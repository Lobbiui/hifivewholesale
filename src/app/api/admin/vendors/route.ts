import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { temporaryBuyerPasswordError } from "@/lib/customer-account-input";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";
import { hashPassword } from "@/lib/server/passwords";
import { publicSiteOrigin } from "@/lib/server/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    company: z.string().trim().min(2).max(180),
    contactName: z.string().trim().min(2).max(150),
    email: z.string().trim().toLowerCase().email().max(254),
    organizationType: z.enum(["BRAND", "DISTRIBUTOR"]),
    websiteUrl: z.string().trim().max(500).optional().default(""),
    productIds: z.array(z.string().min(1)).max(1000).default([]),
    setupMethod: z.enum(["ACTIVATION_LINK", "TEMPORARY_PASSWORD"]).default("ACTIVATION_LINK"),
    temporaryPassword: z.string().max(200).optional().default(""),
  }),
  z.object({
    action: z.literal("assign_products"),
    organizationId: z.string().min(1),
    productIds: z.array(z.string().min(1)).max(1000),
  }),
  z.object({
    action: z.literal("status"),
    userId: z.string().min(1),
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  }),
  z.object({ action: z.literal("reset"), userId: z.string().min(1) }),
]);

export async function GET() {
  if (!(await getAdminIdentity("SUPER_ADMIN")))
    return NextResponse.json({ ok: false }, { status: 403 });
  const database = await getDatabase();
  const [vendors, products] = await Promise.all([
    database.query(
      `SELECT u.id AS user_id,u.email,u.display_name,u.status,u.created_at,
              o.id AS organization_id,o.display_name AS company,o.organization_type,o.website_url,
              COUNT(DISTINCT s.id) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP)::int AS active_sessions,
              MAX(s.last_seen_at) AS last_seen_at,
              COALESCE((SELECT jsonb_agg(a.product_id ORDER BY a.product_id)
                FROM vendor_product_assignments a WHERE a.vendor_organization_id=o.id),'[]'::jsonb) AS product_ids
         FROM users u
         JOIN organization_memberships om ON om.user_id=u.id
         JOIN organizations o ON o.id=om.organization_id
         LEFT JOIN sessions s ON s.user_id=u.id
        WHERE u.system_role='VENDOR' AND o.organization_type IN ('BRAND','DISTRIBUTOR')
        GROUP BY u.id,o.id
        ORDER BY o.display_name,u.created_at`,
    ),
    database.query(
      `SELECT id,name,brand,product_type,category,status
         FROM products WHERE status<>'ARCHIVED' ORDER BY brand,name`,
    ),
  ]);
  return NextResponse.json({ ok: true, vendors: vendors.rows, products: products.rows });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const actor = await getAdminIdentity("SUPER_ADMIN");
  if (!actor) return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Invalid vendor operation." }, { status: 422 });

  const database = await getDatabase();
  const data = parsed.data;
  let activationUrl: string | undefined;
  try {
    await database.transaction(async (transaction) => {
      if (data.action === "create") {
        const temporaryPasswordError = data.setupMethod === "TEMPORARY_PASSWORD"
          ? temporaryBuyerPasswordError(data.temporaryPassword)
          : null;
        if (temporaryPasswordError) throw new Error(temporaryPasswordError);

        const organizationId = randomUUID();
        const userId = randomUUID();
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const temporaryPassword = data.setupMethod === "TEMPORARY_PASSWORD";
        const passwordHash = await hashPassword(
          temporaryPassword ? data.temporaryPassword : randomBytes(32).toString("base64url"),
        );
        await transaction.query(
          `INSERT INTO organizations (id,legal_name,display_name,organization_type,status,website_url)
           VALUES ($1,$2,$2,$3,'APPROVED',$4)`,
          [organizationId, data.company, data.organizationType, data.websiteUrl || null],
        );
        await transaction.query(
          `INSERT INTO users (id,email,display_name,system_role,status,must_change_password,email_verified_at)
           VALUES ($1,$2,$3,'VENDOR',$4,$5,CASE WHEN $4='ACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
          [userId, data.email, data.contactName, temporaryPassword ? "ACTIVE" : "INVITED", temporaryPassword],
        );
        await transaction.query(
          `INSERT INTO user_credentials (user_id,password_hash,reset_token_hash,reset_token_expires_at)
           VALUES ($1,$2,$3,CASE WHEN $3::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP+INTERVAL '24 hours' END)`,
          [userId, passwordHash, temporaryPassword ? null : tokenHash],
        );
        await transaction.query(
          `INSERT INTO organization_memberships (id,organization_id,user_id,membership_role)
           VALUES ($1,$2,$3,'OWNER')`,
          [randomUUID(), organizationId, userId],
        );
        await replaceAssignments(transaction, actor.id, organizationId, data.productIds);
        if (!temporaryPassword) {
          activationUrl = `${publicSiteOrigin(request)}/vendor/activate?token=${encodeURIComponent(token)}`;
          await queueAndSendEmail(transaction, {
            templateKey: "vendor_invitation",
            recipient: data.email,
            subject: "Activate your HiFive vendor portal",
            text: `HiFive Supply created a read-only vendor portal for ${data.company}. Activate it within 24 hours: ${activationUrl}`,
          });
        }
      } else if (data.action === "assign_products") {
        const found = await transaction.query(
          `SELECT id FROM organizations WHERE id=$1 AND organization_type IN ('BRAND','DISTRIBUTOR')`,
          [data.organizationId],
        );
        if (!found.rows[0]) throw new Error("Vendor company not found.");
        await replaceAssignments(transaction, actor.id, data.organizationId, data.productIds);
      } else if (data.action === "status") {
        const found = await transaction.query<{ organization_id: string }>(
          `SELECT om.organization_id FROM users u JOIN organization_memberships om ON om.user_id=u.id
            WHERE u.id=$1 AND u.system_role='VENDOR' LIMIT 1`,
          [data.userId],
        );
        if (!found.rows[0]) throw new Error("Vendor account not found.");
        await transaction.query(
          "UPDATE users SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND system_role='VENDOR'",
          [data.userId, data.status],
        );
        await transaction.query(
          "UPDATE organizations SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [found.rows[0].organization_id, data.status === "ACTIVE" ? "APPROVED" : "SUSPENDED"],
        );
        if (data.status !== "ACTIVE")
          await transaction.query(
            "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL",
            [data.userId],
          );
      } else {
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const found = await transaction.query<{ email: string; status: string }>(
          "SELECT email,status FROM users WHERE id=$1 AND system_role='VENDOR'",
          [data.userId],
        );
        if (!found.rows[0]) throw new Error("Vendor account not found.");
        if (found.rows[0].status === "SUSPENDED")
          throw new Error("Reactivate the vendor portal before sending a password reset.");
        await transaction.query(
          `UPDATE user_credentials SET reset_token_hash=$2,
           reset_token_expires_at=CURRENT_TIMESTAMP+INTERVAL '24 hours' WHERE user_id=$1`,
          [data.userId, tokenHash],
        );
        activationUrl = `${publicSiteOrigin(request)}/vendor/activate?token=${encodeURIComponent(token)}`;
        await queueAndSendEmail(transaction, {
          templateKey: "vendor_password_reset",
          recipient: found.rows[0].email,
          subject: "Reset your HiFive vendor portal password",
          text: `Reset your HiFive vendor portal password within 24 hours: ${activationUrl}`,
        });
      }

      const auditData = data.action === "create"
        ? {
            action: data.action,
            company: data.company,
            contactName: data.contactName,
            email: data.email,
            organizationType: data.organizationType,
            productIds: data.productIds,
            setupMethod: data.setupMethod,
          }
        : data;
      await transaction.query(
        `INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id,after_json)
         VALUES ($1,$2,$3,'VENDOR',$4,$5)`,
        [randomUUID(), actor.id, `VENDOR_${data.action.toUpperCase()}`, "organizationId" in data ? data.organizationId : "userId" in data ? data.userId : "new", auditData],
      );
    });

    return NextResponse.json({
      ok: true,
      activationUrl,
      message: data.action === "create" && data.setupMethod === "TEMPORARY_PASSWORD"
        ? "Vendor login created. Share the temporary password securely; it must be replaced at first sign-in."
        : data.action === "create"
          ? "Vendor login created and activation email requested."
          : "Saved.",
    });
  } catch (error) {
    const raw = String(error);
    const message = error instanceof Error && /not found|Temporary password|Reactivate/i.test(error.message)
      ? error.message
      : /unique|duplicate/i.test(raw)
        ? "That vendor email already exists."
        : "The vendor change could not be saved.";
    return NextResponse.json({ ok: false, message }, { status: 422 });
  }
}

async function replaceAssignments(
  database: Awaited<ReturnType<typeof getDatabase>>,
  actorId: string,
  organizationId: string,
  productIds: string[],
) {
  await database.query(
    "DELETE FROM vendor_product_assignments WHERE vendor_organization_id=$1",
    [organizationId],
  );
  for (const productId of [...new Set(productIds)]) {
    await database.query(
      `INSERT INTO vendor_product_assignments (vendor_organization_id,product_id,assigned_by_user_id)
       SELECT $1,p.id,$3 FROM products p WHERE p.id=$2 AND p.status<>'ARCHIVED'`,
      [organizationId, productId, actorId],
    );
  }
}

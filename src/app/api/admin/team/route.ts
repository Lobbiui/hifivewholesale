import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase, type Database } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";
import { hashPassword } from "@/lib/server/passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const staffRole = z.enum(["SALES_REP", "ADMIN", "SUPER_ADMIN"]);
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    email: z.string().trim().toLowerCase().email(),
    displayName: z.string().trim().min(2).max(150),
    role: staffRole,
    commissionRate: z.number().min(0).max(100).optional().default(0),
    customPricingEnabled: z.boolean().optional().default(false),
    customerIds: z.array(z.string()).max(500).optional().default([]),
  }),
  z.object({
    action: z.literal("sales_settings"),
    id: z.string().min(1),
    commissionRate: z.number().min(0).max(100),
    customPricingEnabled: z.boolean(),
    customerIds: z.array(z.string()).max(500),
  }),
  z.object({
    action: z.literal("status"),
    id: z.string(),
    status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]),
  }),
  z.object({ action: z.literal("revoke_sessions"), id: z.string() }),
  z.object({ action: z.literal("reset"), id: z.string() }),
]);

export async function GET() {
  if (!(await getAdminIdentity("SUPER_ADMIN")))
    return NextResponse.json({ ok: false }, { status: 403 });
  const database = await getDatabase();
  const [users, customers] = await Promise.all([
    database.query(
      `SELECT u.id,u.email,u.display_name,u.system_role,u.status,u.created_at,
              COUNT(DISTINCT s.id) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP)::int AS active_sessions,
              MAX(s.last_seen_at) AS last_seen_at,
              COALESCE(p.commission_rate_bps,0)::int AS commission_rate_bps,
              COALESCE(p.custom_pricing_enabled,FALSE) AS custom_pricing_enabled,
              COALESCE((SELECT jsonb_agg(a.organization_id ORDER BY a.organization_id)
                FROM sales_rep_customer_assignments a WHERE a.sales_rep_user_id=u.id),'[]'::jsonb) AS assigned_customer_ids
         FROM users u
         LEFT JOIN sessions s ON s.user_id=u.id
         LEFT JOIN sales_rep_profiles p ON p.user_id=u.id
        WHERE u.system_role IN ('SALES_REP','ADMIN','SUPER_ADMIN')
        GROUP BY u.id,p.user_id
        ORDER BY u.created_at`,
    ),
    database.query(
      `SELECT id,display_name FROM organizations
        WHERE organization_type='WHOLESALE_BUYER' AND status='APPROVED'
        ORDER BY display_name`,
    ),
  ]);
  return NextResponse.json({ ok: true, users: users.rows, customers: customers.rows });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return NextResponse.json({ ok: false }, { status: 403 });
  const actor = await getAdminIdentity("SUPER_ADMIN");
  if (!actor) return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "Invalid team operation." },
      { status: 422 },
    );

  const database = await getDatabase();
  const data = parsed.data;
  let activationUrl: string | undefined;
  try {
    await database.transaction(async (transaction) => {
      if (data.action === "invite") {
        const id = randomUUID();
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const placeholder = await hashPassword(randomBytes(32).toString("base64url"));
        await transaction.query(
          "INSERT INTO users (id,email,display_name,system_role,status) VALUES ($1,$2,$3,$4,'INVITED')",
          [id, data.email, data.displayName, data.role],
        );
        await transaction.query(
          "INSERT INTO user_credentials (user_id,password_hash,reset_token_hash,reset_token_expires_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP+INTERVAL '24 hours')",
          [id, placeholder, tokenHash],
        );
        if (data.role === "SALES_REP")
          await saveSalesSettings(transaction, actor.id, id, data);
        activationUrl = `${publicOrigin(request)}/admin/activate?token=${encodeURIComponent(token)}`;
        await queueAndSendEmail(transaction, {
          templateKey: "admin_invitation",
          recipient: data.email,
          subject: "Activate your HiFive staff account",
          text: `You were invited to the HiFive staff workspace. Activate your account within 24 hours: ${activationUrl}`,
        });
      } else if (data.action === "sales_settings") {
        const rep = await transaction.query(
          "SELECT id FROM users WHERE id=$1 AND system_role='SALES_REP'",
          [data.id],
        );
        if (!rep.rows[0]) throw new Error("Sales representative not found.");
        await saveSalesSettings(transaction, actor.id, data.id, data);
      } else if (data.action === "status") {
        if (data.id === actor.id && data.status !== "ACTIVE")
          throw new Error("You cannot disable your own account.");
        await transaction.query(
          "UPDATE users SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND system_role IN ('SALES_REP','ADMIN','SUPER_ADMIN')",
          [data.id, data.status],
        );
        if (data.status !== "ACTIVE")
          await transaction.query(
            "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL",
            [data.id],
          );
      } else if (data.action === "revoke_sessions") {
        await transaction.query(
          "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL",
          [data.id],
        );
      } else {
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const found = await transaction.query<{ email: string }>(
          "SELECT email FROM users WHERE id=$1 AND system_role IN ('SALES_REP','ADMIN','SUPER_ADMIN')",
          [data.id],
        );
        if (!found.rows[0]) throw new Error("Staff account not found.");
        await transaction.query(
          "UPDATE user_credentials SET reset_token_hash=$2,reset_token_expires_at=CURRENT_TIMESTAMP+INTERVAL '24 hours' WHERE user_id=$1",
          [data.id, tokenHash],
        );
        activationUrl = `${publicOrigin(request)}/admin/activate?token=${encodeURIComponent(token)}`;
        await queueAndSendEmail(transaction, {
          templateKey: "admin_password_reset",
          recipient: found.rows[0].email,
          subject: "Reset your HiFive staff password",
          text: `Reset your HiFive staff password within 24 hours: ${activationUrl}`,
        });
      }
      await transaction.query(
        "INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id,after_json) VALUES ($1,$2,$3,'ADMIN_USER',$4,$5)",
        [randomUUID(), actor.id, `ADMIN_${data.action.toUpperCase()}`, "id" in data ? data.id : "new", data],
      );
    });
    return NextResponse.json({ ok: true, activationUrl });
  } catch (error) {
    const raw = String(error);
    const message =
      error instanceof Error && /own account|not found/i.test(error.message)
        ? error.message
        : /unique|duplicate/i.test(raw)
          ? "That staff email already exists."
          : "The team change could not be saved.";
    return NextResponse.json({ ok: false, message }, { status: 422 });
  }
}

async function saveSalesSettings(
  transaction: Database,
  actorId: string,
  repId: string,
  data: { commissionRate: number; customPricingEnabled: boolean; customerIds: string[] },
) {
  await transaction.query(
    `INSERT INTO sales_rep_profiles (user_id,commission_rate_bps,custom_pricing_enabled)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET commission_rate_bps=$2,custom_pricing_enabled=$3,updated_at=CURRENT_TIMESTAMP`,
    [repId, Math.round(data.commissionRate * 100), data.customPricingEnabled],
  );
  await transaction.query(
    "DELETE FROM sales_rep_customer_assignments WHERE sales_rep_user_id=$1",
    [repId],
  );
  for (const customerId of [...new Set(data.customerIds)]) {
    await transaction.query(
      `INSERT INTO sales_rep_customer_assignments (sales_rep_user_id,organization_id,assigned_by_user_id)
       SELECT $1,o.id,$3 FROM organizations o
       WHERE o.id=$2 AND o.organization_type='WHOLESALE_BUYER' AND o.status='APPROVED'`,
      [repId, customerId, actorId],
    );
  }
}

function publicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  return `${proto}://${host}`;
}

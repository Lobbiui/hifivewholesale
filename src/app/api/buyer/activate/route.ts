import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { createBuyerSession, hashBuyerToken } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { hashPassword } from "@/lib/server/passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(32).max(200),
  password: z.string().min(12).max(200)
    .regex(/[A-Za-z]/, "Include a letter.")
    .regex(/[0-9]/, "Include a number.")
    .regex(/[^A-Za-z0-9]/, "Include a special character."),
}).strict();

type InvitedBuyer = { user_id: string };

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Use at least 12 characters with a letter, number, and special character." }, { status: 422 });
  }

  const database = await getDatabase();
  const result = await database.query<InvitedBuyer>(
    `SELECT c.user_id
       FROM user_credentials c
       JOIN users u ON u.id = c.user_id
       JOIN organization_memberships om ON om.user_id = u.id
       JOIN organizations o ON o.id = om.organization_id
      WHERE c.reset_token_hash = $1
        AND c.reset_token_expires_at > CURRENT_TIMESTAMP
        AND u.status = 'INVITED'
        AND u.system_role = 'BUYER'
        AND o.status = 'APPROVED'
      LIMIT 1`,
    [hashBuyerToken(parsed.data.token)],
  );
  const invited = result.rows[0];
  if (!invited) return NextResponse.json({ ok: false, message: "This activation link is invalid or has expired." }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);
  await database.transaction(async (transaction) => {
    await transaction.query("UPDATE users SET status = 'ACTIVE', email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [invited.user_id]);
    await transaction.query(
      `UPDATE user_credentials SET password_hash = $2, password_updated_at = CURRENT_TIMESTAMP,
        reset_token_hash = NULL, reset_token_expires_at = NULL, failed_attempts = 0, locked_until = NULL
        WHERE user_id = $1`,
      [invited.user_id, passwordHash],
    );
  });
  const response = NextResponse.json({ ok: true });
  await createBuyerSession(invited.user_id, request, response);
  return response;
}

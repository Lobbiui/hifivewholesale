import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { hashPassword, verifyPassword } from "@/lib/server/passwords";
import {
  getVendorIdentity,
  hashVendorToken,
  vendorSessionCookieName,
} from "@/lib/server/vendor-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200)
    .regex(/[A-Za-z]/, "Include a letter.")
    .regex(/[0-9]/, "Include a number.")
    .regex(/[^A-Za-z0-9]/, "Include a special character."),
}).strict();

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const vendor = await getVendorIdentity({ allowPasswordChangeRequired: true });
  if (!vendor) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Use at least 12 characters with a letter, number, and special character." }, { status: 422 });

  const database = await getDatabase();
  const credential = await database.query<{ password_hash: string }>(
    "SELECT password_hash FROM user_credentials WHERE user_id=$1",
    [vendor.id],
  );
  if (!credential.rows[0] || !await verifyPassword(parsed.data.currentPassword, credential.rows[0].password_hash))
    return NextResponse.json({ ok: false, message: "The temporary password is incorrect." }, { status: 401 });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const token = (await cookies()).get(vendorSessionCookieName())?.value;
  const currentSessionHash = token ? hashVendorToken(token) : "";
  await database.transaction(async (transaction) => {
    await transaction.query(
      `UPDATE user_credentials SET password_hash=$2,password_updated_at=CURRENT_TIMESTAMP,
       failed_attempts=0,locked_until=NULL,reset_token_hash=NULL,reset_token_expires_at=NULL
       WHERE user_id=$1`,
      [vendor.id, passwordHash],
    );
    await transaction.query(
      "UPDATE users SET must_change_password=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
      [vendor.id],
    );
    await transaction.query(
      "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL AND token_hash<>$2",
      [vendor.id, currentSessionHash],
    );
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSession, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { verifyPassword } from "@/lib/server/passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
}).strict();

const DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$s-Mu71_j_oJ5K2iPZNnscQ$R7s6kN9ZrZuR9T0bCESQlIPMREM3Ygho_r80vleNPAla2A8zrfACCRzdcbcrdkDHTKFHDDeeItrbLt9rLayW8Q";

type CredentialRow = {
  id: string;
  email: string;
  display_name: string;
  system_role: "ADMIN" | "SUPER_ADMIN";
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | string | null;
};

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Invalid request origin." }, { status: 403 });
  }

  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Enter a valid email and password." }, { status: 400 });
  }

  const database = await getDatabase();
  const result = await database.query<CredentialRow>(
    `SELECT u.id, u.email, u.display_name, u.system_role, c.password_hash, c.failed_attempts, c.locked_until
       FROM users u
       JOIN user_credentials c ON c.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
        AND u.status = 'ACTIVE'
        AND u.system_role IN ('ADMIN', 'SUPER_ADMIN')
      LIMIT 1`,
    [parsed.data.email],
  );
  const user = result.rows[0];
  const now = Date.now();
  if (user?.locked_until && new Date(user.locked_until).getTime() > now) {
    return NextResponse.json({ ok: false, message: "This account is temporarily locked. Try again later." }, { status: 429 });
  }

  const validPassword = await verifyPassword(parsed.data.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  const valid = Boolean(user && validPassword);
  if (!user || !valid) {
    if (user) {
      const attempts = user.failed_attempts + 1;
      await database.query(
        `UPDATE user_credentials
            SET failed_attempts = CASE WHEN $2 >= 5 THEN 0 ELSE $2 END,
                locked_until = CASE WHEN $2 >= 5 THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE NULL END
          WHERE user_id = $1`,
        [user.id, attempts],
      );
    }
    return NextResponse.json({ ok: false, message: "The email or password is incorrect." }, { status: 401 });
  }

  await database.query("UPDATE user_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1", [user.id]);
  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, displayName: user.display_name, role: user.system_role },
  });
  await createAdminSession(user.id, request, response);
  return response;
}

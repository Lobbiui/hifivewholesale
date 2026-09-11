import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getDatabase } from "./database";

const SESSION_HOURS = 12;

export type AdminRole = "ADMIN" | "SUPER_ADMIN";
export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
};

type SessionRow = {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  system_role: AdminRole;
};

export function sessionCookieName() {
  return process.env.SESSION_COOKIE_NAME?.trim() || "hifive_session";
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hasValidRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  return origin === new URL(request.url).origin;
}

export async function createAdminSession(userId: string, request: Request, response: NextResponse) {
  const database = await getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await database.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, hashSessionToken(token), expiresAt, request.headers.get("user-agent")?.slice(0, 500) ?? null],
  );
  response.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getAdminIdentity(requiredRole?: AdminRole): Promise<AdminIdentity | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;

  const database = await getDatabase();
  const result = await database.query<SessionRow>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.display_name, u.system_role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > CURRENT_TIMESTAMP
        AND u.status = 'ACTIVE'
        AND u.system_role IN ('ADMIN', 'SUPER_ADMIN')
      LIMIT 1`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  if (!row || (requiredRole === "SUPER_ADMIN" && row.system_role !== "SUPER_ADMIN")) return null;

  await database.query("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [row.session_id]);
  return { id: row.user_id, email: row.email, displayName: row.display_name, role: row.system_role };
}

export async function revokeCurrentSession(response: NextResponse) {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (token) {
    const database = await getDatabase();
    await database.query("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1", [hashSessionToken(token)]);
  }
  response.cookies.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

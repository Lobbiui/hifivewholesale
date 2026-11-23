import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getDatabase } from "./database";

const SESSION_HOURS = 12;

export type VendorIdentity = {
  id: string;
  email: string;
  displayName: string;
  organizationId: string;
  company: string;
  organizationType: "BRAND" | "DISTRIBUTOR";
  mustChangePassword: boolean;
};

type VendorRow = {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  organization_id: string;
  company: string;
  organization_type: "BRAND" | "DISTRIBUTOR";
  must_change_password: boolean;
};

export function vendorSessionCookieName() {
  return process.env.VENDOR_SESSION_COOKIE_NAME?.trim() || "hifive_vendor_session";
}

export function hashVendorToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createVendorSession(userId: string, request: Request, response: NextResponse) {
  const database = await getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await database.query(
    `INSERT INTO sessions (id,user_id,token_hash,expires_at,user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), userId, hashVendorToken(token), expiresAt, request.headers.get("user-agent")?.slice(0, 500) ?? null],
  );
  response.cookies.set(vendorSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getVendorIdentity(
  options: { allowPasswordChangeRequired?: boolean } = {},
): Promise<VendorIdentity | null> {
  const token = (await cookies()).get(vendorSessionCookieName())?.value;
  if (!token) return null;

  const database = await getDatabase();
  const result = await database.query<VendorRow>(
    `SELECT s.id AS session_id,u.id AS user_id,u.email,u.display_name,
            o.id AS organization_id,o.display_name AS company,o.organization_type,
            u.must_change_password
       FROM sessions s
       JOIN users u ON u.id=s.user_id
       JOIN organization_memberships om ON om.user_id=u.id
       JOIN organizations o ON o.id=om.organization_id
      WHERE s.token_hash=$1
        AND s.revoked_at IS NULL
        AND s.expires_at>CURRENT_TIMESTAMP
        AND u.status='ACTIVE'
        AND u.system_role='VENDOR'
        AND o.status='APPROVED'
        AND o.organization_type IN ('BRAND','DISTRIBUTOR')
      LIMIT 1`,
    [hashVendorToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.must_change_password && !options.allowPasswordChangeRequired) return null;

  await database.query("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1", [row.session_id]);
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationId: row.organization_id,
    company: row.company,
    organizationType: row.organization_type,
    mustChangePassword: row.must_change_password,
  };
}

export async function revokeVendorSession(response: NextResponse) {
  const token = (await cookies()).get(vendorSessionCookieName())?.value;
  if (token) {
    const database = await getDatabase();
    await database.query(
      "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1",
      [hashVendorToken(token)],
    );
  }
  response.cookies.set(vendorSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

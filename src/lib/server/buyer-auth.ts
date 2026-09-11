import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getDatabase } from "./database";

const SESSION_HOURS = 12;

export type BuyerIdentity = {
  id: string;
  email: string;
  displayName: string;
  organizationId: string;
  company: string;
  applicationId: string | null;
};

type BuyerRow = {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  organization_id: string;
  company: string;
  application_id: string | null;
};

export function buyerSessionCookieName() {
  return process.env.BUYER_SESSION_COOKIE_NAME?.trim() || "hifive_buyer_session";
}

export function hashBuyerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createBuyerSession(userId: string, request: Request, response: NextResponse) {
  const database = await getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await database.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, hashBuyerToken(token), expiresAt, request.headers.get("user-agent")?.slice(0, 500) ?? null],
  );
  response.cookies.set(buyerSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getBuyerIdentityForToken(token: string, touch = false): Promise<BuyerIdentity | null> {
  const database = await getDatabase();
  const result = await database.query<BuyerRow>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.display_name,
            o.id AS organization_id, o.display_name AS company,
            (SELECT ba.id FROM buyer_applications ba WHERE ba.organization_id = o.id ORDER BY ba.submitted_at DESC LIMIT 1) AS application_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organization_memberships om ON om.user_id = u.id
       JOIN organizations o ON o.id = om.organization_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > CURRENT_TIMESTAMP
        AND u.status = 'ACTIVE'
        AND u.system_role = 'BUYER'
        AND o.status = 'APPROVED'
      LIMIT 1`,
    [hashBuyerToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (touch) await database.query("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [row.session_id]);
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationId: row.organization_id,
    company: row.company,
    applicationId: row.application_id,
  };
}

export async function getBuyerIdentity() {
  const token = (await cookies()).get(buyerSessionCookieName())?.value;
  return token ? getBuyerIdentityForToken(token, true) : null;
}

export async function revokeBuyerSession(response: NextResponse) {
  const token = (await cookies()).get(buyerSessionCookieName())?.value;
  if (token) {
    const database = await getDatabase();
    await database.query("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1", [hashBuyerToken(token)]);
  }
  response.cookies.set(buyerSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

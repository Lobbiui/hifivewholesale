import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminIdentity();
  return user
    ? NextResponse.json({ authenticated: true, user })
    : NextResponse.json({ authenticated: false }, { status: 401 });
}

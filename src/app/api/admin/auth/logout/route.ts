import { NextResponse } from "next/server";
import { hasValidRequestOrigin, revokeCurrentSession } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  await revokeCurrentSession(response);
  return response;
}

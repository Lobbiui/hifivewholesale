import { NextResponse } from "next/server";
import { getVendorIdentity } from "@/lib/server/vendor-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getVendorIdentity({ allowPasswordChangeRequired: true });
  return user
    ? NextResponse.json({ authenticated: true, user })
    : NextResponse.json({ authenticated: false }, { status: 401 });
}

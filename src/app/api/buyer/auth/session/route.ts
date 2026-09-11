import { NextResponse } from "next/server";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const buyer = await getBuyerIdentity();
  return buyer
    ? NextResponse.json({ authenticated: true, buyer })
    : NextResponse.json({ authenticated: false }, { status: 401 });
}

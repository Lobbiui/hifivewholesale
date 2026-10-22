import { NextResponse } from "next/server";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { canProcessAuthorizeNetFor, getAuthorizeNetConfig } from "@/lib/server/authorize-net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const buyer = await getBuyerIdentity();
  if (!buyer)
    return NextResponse.json({ ok: false }, { status: 401 });
  const config = getAuthorizeNetConfig();
  const enabled = canProcessAuthorizeNetFor(buyer.email);
  return NextResponse.json({
    ok: true,
    configured: config.configured,
    enabled,
    environment: config.environment,
    apiLoginId: enabled ? config.apiLoginId : "",
    publicClientKey: enabled ? config.publicClientKey : "",
    scriptUrl: enabled ? config.scriptUrl : "",
  });
}

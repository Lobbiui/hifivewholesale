import { NextResponse } from "next/server";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getAuthorizeNetConfig } from "@/lib/server/authorize-net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getBuyerIdentity()))
    return NextResponse.json({ ok: false }, { status: 401 });
  const config = getAuthorizeNetConfig();
  return NextResponse.json({
    ok: true,
    configured: config.configured,
    enabled: config.enabled,
    environment: config.environment,
    apiLoginId: config.enabled ? config.apiLoginId : "",
    publicClientKey: config.enabled ? config.publicClientKey : "",
    scriptUrl: config.enabled ? config.scriptUrl : "",
  });
}

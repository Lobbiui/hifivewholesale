import { NextResponse, type NextRequest } from "next/server";
import { buyerSessionCookieName, getBuyerIdentityForToken } from "@/lib/server/buyer-auth";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(buyerSessionCookieName())?.value;
  const buyer = token ? await getBuyerIdentityForToken(token) : null;
  if (buyer) return NextResponse.next();

  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(accessUrl);
  if (token) response.cookies.delete(buyerSessionCookieName());
  return response;
}

export const config = {
  matcher: ["/", "/shop/:path*", "/checkout", "/account", "/loyalty", "/blog/:path*"],
};

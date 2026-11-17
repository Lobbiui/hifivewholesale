import "server-only";
import { resolvePublicSiteOrigin } from "@/lib/public-origin";

export function publicSiteOrigin(request: Request) {
  return resolvePublicSiteOrigin({
    configured: process.env.NEXT_PUBLIC_SITE_URL,
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
    requestUrl: request.url,
    production: process.env.NODE_ENV === "production",
  });
}

const PRODUCTION_FALLBACK = "https://hifivesupply.com";

export type PublicOriginInput = {
  configured?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
  requestUrl: string;
  production: boolean;
};

function firstHeader(value?: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isInternalHost(origin: string) {
  const hostname = new URL(origin).hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".internal") ||
    !hostname.includes(".")
  ) return true;
  if (/^10\./.test(hostname) || /^127\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const private172 = hostname.match(/^172\.(\d{1,2})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  const carrierNat = hostname.match(/^100\.(\d{1,3})\./);
  return Boolean(carrierNat && Number(carrierNat[1]) >= 64 && Number(carrierNat[1]) <= 127);
}

function productionOrigin(origin: string) {
  if (isInternalHost(origin)) return PRODUCTION_FALLBACK;
  const url = new URL(origin);
  url.protocol = "https:";
  return url.origin;
}

export function resolvePublicSiteOrigin(input: PublicOriginInput) {
  const configured = input.configured?.trim();
  if (configured) {
    const origin = normalizedOrigin(configured);
    if (origin) return input.production ? productionOrigin(origin) : origin;
  }

  const requestOrigin = new URL(input.requestUrl).origin;
  const forwardedHost = firstHeader(input.forwardedHost);
  const host = forwardedHost || firstHeader(input.host) || new URL(input.requestUrl).host;
  const forwardedProto = firstHeader(input.forwardedProto);
  const protocol = forwardedProto || new URL(input.requestUrl).protocol.replace(":", "");
  const forwardedOrigin = normalizedOrigin(`${protocol}://${host}`) ?? requestOrigin;
  return input.production ? productionOrigin(forwardedOrigin) : forwardedOrigin;
}

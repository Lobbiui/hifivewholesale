"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";
import { Header } from "./header";
import { AgeGate } from "./age-gate";
import { WholesaleAccessGate } from "./wholesale-access-gate";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const admin = pathname.startsWith("/admin") || pathname.startsWith("/super-admin");
  const publicRoute = pathname.startsWith("/brands") || pathname.startsWith("/terms") || pathname.startsWith("/contact");
  if (admin) return children;
  if (publicRoute) return <><Header />{children}<Footer /></>;
  return <WholesaleAccessGate><Header /><AgeGate />{children}<Footer /></WholesaleAccessGate>;
}

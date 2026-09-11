"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";
import { Header } from "./header";
import { AgeGate } from "./age-gate";
import { ChatWidget } from "./chat-widget";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const admin = pathname.startsWith("/admin") || pathname.startsWith("/super-admin");
  const access = pathname.startsWith("/access") || pathname.startsWith("/activate");
  const publicRoute = pathname.startsWith("/brands") || pathname.startsWith("/terms") || pathname.startsWith("/contact");
  if (admin || access) return children;
  if (publicRoute) return <><Header />{children}<Footer /><ChatWidget /></>;
  return <><Header /><AgeGate />{children}<Footer /><ChatWidget /></>;
}

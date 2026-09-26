import type { Metadata } from "next";
import "./globals.css";
import "./logo-wave.css";
import { CartProvider } from "@/components/cart-provider";
import { LanguageProvider } from "@/components/language-provider";
import { SiteChrome } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Hi-Five Supply | Wholesale, Elevated", description: "Fast-moving wholesale products, flexible fulfillment, and real retailer support." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><LanguageProvider><CartProvider><SiteChrome>{children}</SiteChrome></CartProvider></LanguageProvider></body></html>;
}

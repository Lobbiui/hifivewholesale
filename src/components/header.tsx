"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-provider";
import { Language, useLanguage } from "./language-provider";

export function Header() {
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  const { language, setLanguage, copy } = useLanguage();
  const pathname = usePathname();
  const lightHeader = pathname === "/checkout" || pathname === "/account";
  return (
    <header className={lightHeader ? "site-header site-header-light" : "site-header"}>
      <div className="header-inner">
        <Link href="/" className="brand"><Image src="/images/hifive-logo.png" alt="Hi-Five Supply" width={196} height={106} priority /></Link>
        <nav className={open ? "nav-open" : ""}>
          <Link href="/shop" onClick={() => setOpen(false)}>{copy.shop}</Link>
          <Link href="/loyalty" onClick={() => setOpen(false)}>{copy.loyalty}</Link>
          <Link href="/blog" onClick={() => setOpen(false)}>{copy.journal}</Link>
          <Link href="/brands" onClick={() => setOpen(false)}>{copy.brands}</Link>
          <Link href="/#story" onClick={() => setOpen(false)}>{copy.story}</Link>
          <Link href="/account" onClick={() => setOpen(false)}>{copy.login}</Link>
        </nav>
        <div className="header-tools">
          <label className="sr-only" htmlFor="language">Language</label>
          <select id="language" value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Select language">
            <option value="en">EN</option><option value="es">ES</option><option value="ar">AR</option>
          </select>
          <Link href="/checkout" className="cart-link" aria-label={`${copy.cart}: ${count}`}><ShoppingBag size={18} /><span>{count}</span></Link>
          <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}

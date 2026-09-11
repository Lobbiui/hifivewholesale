"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/data";
import { useCart } from "./cart-provider";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const quickAdd = () => {
    add(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };
  return <article className="product-card">
    <Link href={`/shop/${product.id}`} className="product-visual" style={{ "--product": product.color, "--accent": product.accent } as React.CSSProperties}>
      {product.badge && <span className="product-badge">{product.badge}</span>}
      <Image className="product-photo" src={product.images[0]} alt={`${product.brand} ${product.name}`} fill sizes="(max-width: 560px) 92vw, (max-width: 1000px) 45vw, 25vw" />
      <span className="zoom-note">View product <ArrowUpRight size={13}/></span>
    </Link>
    <div className="product-info"><div><span>{product.brand} · {product.strength}</span><h3><Link href={`/shop/${product.id}`}>{product.name}</Link></h3><p>{product.casePrice === null ? "Account pricing" : `$${product.casePrice.toFixed(2)} / case`}</p></div><button className={added ? "quick-add added" : "quick-add"} onClick={quickAdd} aria-label={added ? `${product.name} added to cart` : `Add ${product.name} to cart`}>{added ? <Check /> : <Plus />}</button></div>
    <span className="sr-only" aria-live="polite">{added ? `${product.name} added to cart` : ""}</span>
  </article>;
}

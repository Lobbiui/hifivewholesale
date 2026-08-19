"use client";

import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import type { Product } from "@/lib/data";
import { useCart } from "./cart-provider";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  return <article className="product-card"><Link href={`/shop/${product.id}`} className="product-visual" style={{ "--product": product.color, "--accent": product.accent } as React.CSSProperties}>{product.badge && <span className="product-badge">{product.badge}</span>}<div className={`product-pack ${product.category === "Disposables" ? "device" : ""}`}><i /><strong>HI<br/>FIVE</strong><small>{product.flavor}</small></div><span className="zoom-note">View product <ArrowUpRight size={13}/></span></Link><div className="product-info"><div><span>{product.brand} · {product.strength}</span><h3><Link href={`/shop/${product.id}`}>{product.name}</Link></h3><p>${product.casePrice.toFixed(2)} / case</p></div><button onClick={() => add(product)} aria-label={`Add ${product.name} to cart`}><Plus /></button></div></article>;
}

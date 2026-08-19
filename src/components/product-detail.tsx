"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, Box, Check, Minus, Plus, ShieldCheck, ShoppingBag, Truck, ZoomIn } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/data";
import { products } from "@/lib/data";
import { useCart } from "./cart-provider";
import { ProductCard } from "./product-card";

export function ProductDetail({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const related = products.filter((item) => item.id !== product.id && (item.category === product.category || item.brand === product.brand)).slice(0, 3);
  const addCases = () => {
    for (let index = 0; index < quantity; index += 1) add(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  return <main className="product-detail-page">
    <section className="product-detail-shell container">
      <Link href="/shop" className="back-to-shop"><ArrowLeft/>Back to catalog</Link>
      <div className="product-detail-grid">
        <div className="detail-visual-wrap">
          <div className="detail-visual" style={{ "--product": product.color, "--accent": product.accent } as React.CSSProperties}>
            {product.badge && <span className="product-badge">{product.badge}</span>}
            <div className={`product-pack detail-pack ${product.category === "Disposables" ? "device" : ""}`}><i/><strong>HI<br/>FIVE</strong><small>{product.flavor}</small></div>
            <div className="detail-orbit orbit-one"/><div className="detail-orbit orbit-two"/>
            <span className="detail-zoom"><ZoomIn/>Hover to zoom</span>
          </div>
          <div className="detail-thumbnails"><button className="active"><span style={{ background: product.color }}>HF</span></button><button><span style={{ background: product.accent }}>CASE</span></button><button><span>INFO</span></button></div>
        </div>
        <div className="detail-copy">
          <div className="detail-kicker"><span>{product.brand}</span><span>{product.category}</span><span>SKU HF-{product.id.slice(0, 3).toUpperCase()}-{product.strength.replace(/\D/g, "") || "STD"}</span></div>
          <h1>{product.name}</h1>
          <p className="detail-lead">A shelf-ready wholesale selection built for reliable turns, clear merchandising, and easy replenishment.</p>
          <div className="detail-specs"><div><small>Flavor</small><strong>{product.flavor}</strong></div><div><small>Strength</small><strong>{product.strength}</strong></div><div><small>Format</small><strong>{product.category}</strong></div></div>
          <div className="price-block"><div><small>Wholesale case price</small><strong>${product.casePrice.toFixed(2)}</strong><span>${product.price.toFixed(2)} estimated unit cost</span></div><span className="stock-status"><Check/>In stock</span></div>
          <div className="purchase-controls"><div className="case-quantity"><button onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease case quantity"><Minus/></button><div><strong>{quantity}</strong><small>{quantity === 1 ? "case" : "cases"}</small></div><button onClick={() => setQuantity((current) => current + 1)} aria-label="Increase case quantity"><Plus/></button></div><button className={added ? "button primary purchase-button added" : "button primary purchase-button"} onClick={addCases}>{added ? <><Check/>Added to cart</> : <><ShoppingBag/>Add {quantity} {quantity === 1 ? "case" : "cases"}</>}</button></div>
          <div className="volume-note"><BadgeCheck/><div><b>Need volume pricing?</b><p>Account-specific tiers and mixed-case programs can be configured by the wholesale team.</p></div><Link href="/contact">Ask wholesale <ArrowRight/></Link></div>
          <div className="fulfillment-promises"><span><Box/>Warehouse pickup</span><span><Truck/>Delivery and freight</span><span><ShieldCheck/>Approved buyers only</span></div>
        </div>
      </div>
    </section>
    <section className="product-story"><div className="container"><div><span className="eyebrow light">Retail-ready details</span><h2>BUILT TO<br/>MOVE CLEANLY.</h2></div><div><p>Product records in the final system will include complete manufacturer media, case packs, variant matrices, compliance documents, inventory by location, and account-specific pricing.</p><ul><li><Check/>Clear strength and flavor identification</li><li><Check/>Consistent case-level ordering</li><li><Check/>Inventory and low-stock visibility</li><li><Check/>Territory restriction readiness</li></ul></div></div></section>
    {related.length > 0 && <section className="section container"><div className="section-heading"><div><span className="eyebrow">Related wholesale picks</span><h2>KEEP THE<br/><em>SHELF MOVING.</em></h2></div><Link href="/shop" className="text-link">View all products <ArrowRight/></Link></div><div className="product-grid related-products">{related.map((item) => <ProductCard product={item} key={item.id}/>)}</div></section>}
  </main>;
}


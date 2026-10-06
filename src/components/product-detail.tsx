"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Box,
  Check,
  FileCheck2,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
  ZoomIn,
} from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/data";
import { useCart } from "./cart-provider";
import { ProductCard } from "./product-card";

export function ProductDetail({
  product,
  related,
}: {
  product: Product;
  related: Product[];
}) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants?.[0]?.id ?? "",
  );
  const { add } = useCart();
  const selectedVariant =
    product.variants?.find((variant) => variant.id === selectedVariantId) ??
    product.variants?.[0];
  const selectedProduct = selectedVariant
    ? {
        ...product,
        flavor: selectedVariant.name,
        price: selectedVariant.price,
        casePrice: selectedVariant.casePrice,
        images: selectedVariant.images?.length
          ? selectedVariant.images
          : product.images,
        coa: selectedVariant.coa?.length ? selectedVariant.coa : product.coa,
      }
    : product;
  const addCases = () => {
    add(selectedProduct, quantity, selectedVariant);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  return (
    <main className="product-detail-page">
      <section className="product-detail-shell container">
        <Link href="/shop" className="back-to-shop">
          <ArrowLeft />
          Back to catalog
        </Link>
        <div className="product-detail-grid">
          <div className="detail-visual-wrap">
            <button
              type="button"
              className="detail-visual"
              style={
                {
                  "--product": product.color,
                  "--accent": product.accent,
                } as React.CSSProperties
              }
              onClick={() => setZoomed(true)}
              aria-label={`Zoom ${product.name} product image`}
            >
              {product.badge && (
                <span className="product-badge">{product.badge}</span>
              )}
              <Image
                className="detail-product-photo"
                src={
                  selectedProduct.images[activeImage] ??
                  selectedProduct.images[0]
                }
                alt={`${product.brand} ${product.name}${activeImage > 0 ? ` product view ${activeImage + 1}` : ""}`}
                width={480}
                height={480}
                priority
                unoptimized={(
                  selectedProduct.images[activeImage] ??
                  selectedProduct.images[0]
                ).startsWith("https://")}
              />
              <div className="detail-orbit orbit-one" />
              <div className="detail-orbit orbit-two" />
              <span className="detail-zoom">
                <ZoomIn />
                Click or tap to zoom
              </span>
            </button>
            <div className="detail-thumbnails">
              {selectedProduct.images.map((image, index) => (
                <button
                  key={image}
                  className={activeImage === index ? "active" : ""}
                  onClick={() => setActiveImage(index)}
                  aria-label={`View product image ${index + 1}`}
                >
                  <Image
                    src={image}
                    alt=""
                    width={58}
                    height={58}
                    unoptimized={image.startsWith("https://")}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="detail-copy">
            <div className="detail-kicker">
              <span>{product.brand}</span>
              <span>{product.category}</span>
              <span>
                SKU HF-{product.id.slice(0, 3).toUpperCase()}-
                {product.strength.replace(/\D/g, "") || "STD"}
              </span>
            </div>
            <h1>{product.name}</h1>
            <p className="detail-lead">{product.description}</p>
            {product.variants && product.variants.length > 1 && (
              <label className="product-option-picker">
                <span>Choose flavor / option</span>
                <select
                  value={selectedVariantId}
                  onChange={(event) => {
                    setSelectedVariantId(event.target.value);
                    setActiveImage(0);
                  }}
                >
                  {product.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="detail-specs">
              <div>
                <small>Flavor / option</small>
                <strong>{selectedVariant?.name ?? product.flavor}</strong>
              </div>
              <div>
                <small>Product stats</small>
                <strong>{product.strength}</strong>
              </div>
              <div>
                <small>Format</small>
                <strong>{product.format}</strong>
              </div>
            </div>
            <div className="price-block">
              <div>
                <small>Wholesale case price</small>
                <strong>
                  {selectedProduct.casePrice === null
                    ? "Account pricing"
                    : `$${selectedProduct.casePrice.toFixed(2)}`}
                </strong>
                <span>
                  {selectedProduct.price === null
                    ? "Visible after wholesale account approval"
                    : `$${selectedProduct.price.toFixed(2)} estimated unit cost`}
                </span>
              </div>
              <span className="stock-status">
                <Check />
                Catalog ready
              </span>
            </div>
            <div className="purchase-controls">
              <div className="case-quantity">
                <button
                  onClick={() =>
                    setQuantity((current) => Math.max(1, current - 1))
                  }
                  aria-label="Decrease case quantity"
                >
                  <Minus />
                </button>
                <div>
                  <strong>{quantity}</strong>
                  <small>{quantity === 1 ? "case" : "cases"}</small>
                </div>
                <button
                  onClick={() => setQuantity((current) => current + 1)}
                  aria-label="Increase case quantity"
                >
                  <Plus />
                </button>
              </div>
              <button
                className={
                  added
                    ? "button primary purchase-button added"
                    : "button primary purchase-button"
                }
                onClick={addCases}
              >
                {added ? (
                  <>
                    <Check />
                    Added to cart
                  </>
                ) : (
                  <>
                    <ShoppingBag />
                    Add {quantity} {quantity === 1 ? "case" : "cases"}
                  </>
                )}
              </button>
            </div>
            <div className="volume-note">
              <BadgeCheck />
              <div>
                <b>Need volume pricing?</b>
                <p>
                  Account-specific tiers and mixed-case programs can be
                  configured by the wholesale team.
                </p>
              </div>
              <Link href="/contact">
                Ask wholesale <ArrowRight />
              </Link>
            </div>
            {selectedProduct.coa.length > 0 && (
              <div className="coa-links">
                <FileCheck2 />
                <div>
                  <b>Certificates of analysis</b>
                  <p>Manufacturer-provided product documentation.</p>
                </div>
                <div>
                  {selectedProduct.coa.map((document, index) => (
                    <a
                      key={document}
                      href={document}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View COA
                      {selectedProduct.coa.length > 1 ? ` ${index + 1}` : ""}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="fulfillment-promises">
              <span>
                <Box />
                Warehouse pickup
              </span>
              <span>
                <Truck />
                Delivery and freight
              </span>
              <span>
                <ShieldCheck />
                Approved buyers only
              </span>
            </div>
          </div>
        </div>
      </section>
      <div className="mobile-purchase-bar">
        <div>
          <small>Wholesale case</small>
          <strong>
            {selectedProduct.casePrice === null
              ? "Account pricing"
              : `$${selectedProduct.casePrice.toFixed(2)}`}
          </strong>
        </div>
        <button
          className={added ? "button primary added" : "button primary"}
          onClick={addCases}
        >
          {added ? (
            <>
              <Check />
              Added
            </>
          ) : (
            <>
              <ShoppingBag />
              Add {quantity} {quantity === 1 ? "case" : "cases"}
            </>
          )}
        </button>
      </div>
      {zoomed && (
        <div
          className="product-zoom-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} enlarged image`}
        >
          <button
            className="zoom-close"
            onClick={() => setZoomed(false)}
            aria-label="Close enlarged image"
          >
            <X />
          </button>
          <div>
            <Image
              src={
                selectedProduct.images[activeImage] ?? selectedProduct.images[0]
              }
              alt={`${product.brand} ${product.name} enlarged`}
              fill
              unoptimized={(
                selectedProduct.images[activeImage] ?? selectedProduct.images[0]
              ).startsWith("https://")}
              sizes="100vw"
            />
          </div>
        </div>
      )}
      <section className="product-story">
        <div className="container">
          <div>
            <span className="eyebrow light">Retail-ready details</span>
            <h2>
              BUILT TO
              <br />
              MOVE CLEANLY.
            </h2>
          </div>
          <div>
            <p>
              Product records in the final system will include complete
              manufacturer media, case packs, variant matrices, compliance
              documents, inventory by location, and account-specific pricing.
            </p>
            <ul>
              <li>
                <Check />
                Clear strength and flavor identification
              </li>
              <li>
                <Check />
                Consistent case-level ordering
              </li>
              <li>
                <Check />
                Inventory and low-stock visibility
              </li>
              <li>
                <Check />
                Territory restriction readiness
              </li>
            </ul>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="section container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Related wholesale picks</span>
              <h2>
                KEEP THE
                <br />
                <em>SHELF MOVING.</em>
              </h2>
            </div>
            <Link href="/shop" className="text-link">
              View all products <ArrowRight />
            </Link>
          </div>
          <div className="product-grid related-products">
            {related.map((item) => (
              <ProductCard product={item} key={item.id} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

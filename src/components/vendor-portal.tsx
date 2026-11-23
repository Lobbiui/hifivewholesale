"use client";

import { ExternalLink, FileCheck2, LogOut, PackageCheck, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type VendorIdentity = {
  id: string;
  email: string;
  displayName: string;
  organizationId: string;
  company: string;
  organizationType: "BRAND" | "DISTRIBUTOR";
  mustChangePassword: boolean;
};

type VendorVariant = {
  id: string;
  name: string;
  sku: string;
  upc: string;
  unitsPerCase: number;
  price: number | null;
  available: boolean;
  imageUrls: string[];
  coaUrls: string[];
};

type VendorProduct = {
  id: string;
  name: string;
  brand: string;
  productLine: string;
  productType: string;
  category: string;
  description: string;
  status: string;
  imageUrls: string[];
  coaUrls: string[];
  storefrontUrl: string | null;
  variants: VendorVariant[];
};

export function VendorPortal() {
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<VendorIdentity | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/vendor/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!active) return;
      if (response.ok) {
        const result = await response.json() as { user: VendorIdentity };
        setIdentity(result.user);
      }
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!identity || identity.mustChangePassword) return;
    void fetch("/api/vendor/products", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { products?: VendorProduct[] };
      if (response.ok) setProducts(result.products ?? []);
      else setMessage("Your assigned products could not be loaded.");
    }).catch(() => setMessage("Your assigned products could not be loaded."));
  }, [identity]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/vendor/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const result = await response.json() as { message?: string; user?: VendorIdentity };
      if (!response.ok || !result.user) setMessage(result.message || "Sign-in failed.");
      else setIdentity(result.user);
    } catch {
      setMessage("The vendor portal is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/vendor/auth/logout", { method: "POST" });
    setIdentity(null);
    setProducts([]);
  };

  if (!ready) return null;
  if (!identity) return <VendorLogin message={message} busy={busy} signIn={signIn}/>;
  if (identity.mustChangePassword)
    return <VendorPasswordChange identity={identity} complete={() => setIdentity({ ...identity, mustChangePassword: false })} signOut={signOut}/>;

  const published = products.filter((product) => product.status === "PUBLISHED").length;
  const options = products.reduce((total, product) => total + product.variants.length, 0);
  return <main className="vendor-shell">
    <aside>
      <Link href="/"><Image src="/images/hifive-logo-black-banner.png" alt="HiFive Supply" width={180} height={98}/></Link>
      <span className="admin-pill purple">Vendor portal</span>
      <div><small>Company</small><strong>{identity.company}</strong><small>Signed in as</small><strong>{identity.displayName}</strong></div>
      <button onClick={() => void signOut()}><LogOut/>Sign out</button>
    </aside>
    <section className="vendor-main">
      <header><div><span className="eyebrow">Read-only catalog access</span><h1>YOUR HIFIVE PRODUCTS.</h1><p>Review the exact products HiFive Supply has assigned to your company. Product editing and all business operations remain with HiFive Supply.</p></div><ShieldCheck/></header>
      {message && <div className="gate-message">{message}</div>}
      <div className="vendor-stat-grid"><article><b>{products.length}</b><span>Assigned products</span></article><article><b>{options}</b><span>Options and flavors</span></article><article><b>{published}</b><span>Published products</span></article></div>
      {products.length === 0 ? <section className="vendor-empty-state"><PackageCheck/><h2>No products assigned yet</h2><p>HiFive Supply controls your product assignments. Contact your HiFive account representative if you expected to see a product here.</p></section> : <div className="vendor-products">{products.map((product) => <VendorProductCard key={product.id} product={product}/>)}</div>}
      <footer>This portal is view-only. Contact HiFive Supply to request a catalog correction or assignment change.</footer>
    </section>
  </main>;
}

function VendorLogin({ message, busy, signIn }: { message: string; busy: boolean; signIn: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <main className="admin-login vendor-login"><section><Image src="/images/hifive-logo-black-banner.png" alt="HiFive Supply" width={250} height={136}/><div><span className="admin-pill purple">Private vendor portal</span><h1>SEE YOUR<br/><em>PRODUCTS.</em></h1><p>A secure, read-only view of the products HiFive Supply has assigned to your company.</p></div><small>Vendor access never includes customers, orders, costs, payments, or administrative controls.</small></section><form onSubmit={signIn}><span className="eyebrow">Approved vendors</span><h2>VENDOR SIGN-IN.</h2>{message && <div className="gate-message">{message}</div>}<label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="button primary full" disabled={busy}>{busy ? "Signing in..." : "Sign in to vendor portal"}</button><div className="login-proof"><ShieldCheck/>Private session - Company-specific products - Read-only access</div></form></main>;
}

function VendorPasswordChange({ identity, complete, signOut }: { identity: VendorIdentity; complete: () => void; signOut: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword !== String(form.get("confirmation") || "")) { setMessage("The new passwords do not match."); return; }
    setBusy(true);
    const response = await fetch("/api/vendor/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword }) });
    const result = await response.json() as { message?: string };
    setBusy(false);
    if (!response.ok) setMessage(result.message || "The password could not be changed.");
    else complete();
  };
  return <main className="admin-login vendor-login"><section><Image src="/images/hifive-logo-black-banner.png" alt="HiFive Supply" width={250} height={136}/><div><span className="admin-pill purple">Required security step</span><h1>SECURE YOUR<br/><em>VENDOR LOGIN.</em></h1><p>{identity.displayName}, replace the temporary password before viewing {identity.company}&apos;s products.</p></div></section><form onSubmit={submit}><span className="eyebrow">First sign-in</span><h2>CHOOSE A NEW PASSWORD.</h2>{message && <div className="gate-message">{message}</div>}<label>Temporary password<input name="currentPassword" type="password" required/></label><label>New password<input name="newPassword" type="password" minLength={12} required/></label><label>Confirm new password<input name="confirmation" type="password" minLength={12} required/></label><button className="button primary full" disabled={busy}>{busy ? "Saving..." : "Save password and continue"}</button><small>Use at least 12 characters with a letter, number, and special character.</small><button type="button" className="link-button" onClick={() => void signOut()}>Sign out</button></form></main>;
}

function VendorProductCard({ product }: { product: VendorProduct }) {
  const cover = product.imageUrls[0] || product.variants.flatMap((variant) => variant.imageUrls)[0];
  return <article className="vendor-product-card"><header><div className="vendor-product-image">{cover ? <Image src={cover} alt="" width={180} height={180} unoptimized/> : <PackageCheck/>}</div><div><span className={`admin-pill ${product.status === "PUBLISHED" ? "good" : "warn"}`}>{product.status}</span><h2>{product.name}</h2><p>{product.brand}{product.productLine ? ` - ${product.productLine}` : ""}</p><small>{product.productType} - {product.category}</small>{product.description && <p>{product.description}</p>}<div className="vendor-product-links">{product.storefrontUrl && <Link href={product.storefrontUrl} target="_blank">View storefront <ExternalLink/></Link>}{product.coaUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><FileCheck2/>Product COA {index + 1}</a>)}</div></div></header><div className="vendor-option-table"><table><thead><tr><th>Option / flavor</th><th>SKU</th><th>UPC</th><th>Case</th><th>Website price</th><th>Availability</th><th>Media</th></tr></thead><tbody>{product.variants.map((variant) => <tr key={variant.id}><td><b>{variant.name}</b></td><td>{variant.sku || "-"}</td><td>{variant.upc || "-"}</td><td>{variant.unitsPerCase} units</td><td>{variant.price === null ? "Not set" : variant.price.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td><td><span className={`admin-pill ${variant.available ? "good" : "warn"}`}>{variant.available ? "Available" : "Unavailable"}</span></td><td><div className="vendor-media-links">{variant.imageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Image {index + 1}</a>)}{variant.coaUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">COA {index + 1}</a>)}</div></td></tr>)}</tbody></table></div></article>;
}

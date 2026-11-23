"use client";

import { Copy, KeyRound, PackageCheck, Save, Store, UserPlus } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Vendor = {
  user_id: string;
  email: string;
  display_name: string;
  status: string;
  organization_id: string;
  company: string;
  organization_type: "BRAND" | "DISTRIBUTOR";
  website_url: string | null;
  active_sessions: number;
  last_seen_at: string | null;
  product_ids: string[];
};

type Product = {
  id: string;
  name: string;
  brand: string;
  product_type: string;
  category: string;
  status: string;
};

export function AdminVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("Loading vendor accounts...");
  const [activationUrl, setActivationUrl] = useState("");
  const [setupMethod, setSetupMethod] = useState("ACTIVATION_LINK");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/vendors", { cache: "no-store" });
    const result = await response.json() as { vendors?: Vendor[]; products?: Product[] };
    if (!response.ok) throw new Error();
    setVendors(result.vendors ?? []);
    setProducts(result.products ?? []);
    setMessage("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => setMessage("Vendor accounts could not be loaded."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/admin/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as { message?: string; activationUrl?: string };
    if (!response.ok) {
      setMessage(result.message || "The vendor change could not be saved.");
      return false;
    }
    setActivationUrl(result.activationUrl ?? "");
    await load();
    setMessage(result.message || "Saved.");
    return true;
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await act({
      action: "create",
      company: form.get("company"),
      contactName: form.get("contactName"),
      email: form.get("email"),
      organizationType: form.get("organizationType"),
      websiteUrl: form.get("websiteUrl"),
      productIds: form.getAll("productIds").map(String),
      setupMethod: form.get("setupMethod"),
      temporaryPassword: form.get("temporaryPassword") ?? "",
    });
    if (saved) {
      formElement.reset();
      setSetupMethod("ACTIVATION_LINK");
    }
  };

  return <>
    <div className="admin-section-head">
      <div>
        <span className="eyebrow">Super-admin controls</span>
        <h2>VENDOR PORTAL ACCESS.</h2>
        <p>Create a read-only vendor login and choose exactly which products that company can see. Vendors never receive access to customers, orders, internal cost, payments, or administration.</p>
      </div>
    </div>
    {message && <div className="gate-message">{message}</div>}
    {activationUrl && <div className="gate-message activation-link"><b>One-time vendor activation link</b><span>{activationUrl}</span><button className="link-button" onClick={() => void navigator.clipboard.writeText(activationUrl)}><Copy/>Copy</button></div>}

    <form className="admin-card operations-form vendor-create-form" onSubmit={create}>
      <label>Vendor company<input name="company" required /></label>
      <label>Primary contact<input name="contactName" required /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Vendor type<select name="organizationType" defaultValue="BRAND"><option value="BRAND">Brand</option><option value="DISTRIBUTOR">Distributor</option></select></label>
      <label>Website (optional)<input name="websiteUrl" type="url" placeholder="https://" /></label>
      <ProductChecklist products={products} name="productIds" legend="Products this vendor may view" />
      <label>Account setup<select name="setupMethod" value={setupMethod} onChange={(event) => setSetupMethod(event.target.value)}><option value="ACTIVATION_LINK">Email activation link</option><option value="TEMPORARY_PASSWORD">Super Admin creates temporary password</option></select></label>
      {setupMethod === "TEMPORARY_PASSWORD"
        ? <label>Temporary password<input name="temporaryPassword" type="password" minLength={12} maxLength={200} pattern="(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,200}" title="Use 12 or more characters with at least one letter, one number, and one symbol." required/><small>The vendor must replace it at first sign-in.</small></label>
        : <p className="territory-note">The activation link expires after 24 hours. You can copy it and send it directly if email delivery is delayed.</p>}
      <button className="admin-button primary"><UserPlus/>{setupMethod === "TEMPORARY_PASSWORD" ? "Create vendor login" : "Create and send activation"}</button>
    </form>

    <div className="vendor-account-grid">
      {vendors.length === 0 && !message ? <article className="admin-card vendor-empty"><Store/><h3>No vendor logins yet</h3><p>Create the first vendor account above and assign its products.</p></article> : null}
      {vendors.map((vendor) => <VendorCard key={vendor.user_id} vendor={vendor} products={products} act={act} />)}
    </div>
  </>;
}

function ProductChecklist({ products, name, legend, selected = [] }: { products: Product[]; name: string; legend: string; selected?: string[] }) {
  const grouped = useMemo(() => {
    const result = new Map<string, Product[]>();
    for (const product of products) result.set(product.brand, [...(result.get(product.brand) ?? []), product]);
    return [...result.entries()];
  }, [products]);
  return <fieldset className="full-field vendor-product-checklist"><legend>{legend}</legend>{grouped.map(([brand, entries]) => <div key={brand}><strong>{brand}</strong>{entries.map((product) => <label key={product.id}><input name={name} value={product.id} type="checkbox" defaultChecked={selected.includes(product.id)}/><span>{product.name}<small>{product.product_type} - {product.category} - {product.status}</small></span></label>)}</div>)}</fieldset>;
}

function VendorCard({ vendor, products, act }: { vendor: Vendor; products: Product[]; act: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const saveAssignments = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act({ action: "assign_products", organizationId: vendor.organization_id, productIds: form.getAll("productIds").map(String) });
  };
  return <article className="admin-card vendor-account-card">
    <header><div><span className="admin-pill good">{vendor.organization_type}</span><h3>{vendor.company}</h3><p>{vendor.display_name} - {vendor.email}</p></div><PackageCheck/></header>
    <div className="vendor-account-facts"><span><b>{vendor.product_ids.length}</b> assigned products</span><span><b>{vendor.active_sessions}</b> active sessions</span><span><b>{vendor.status}</b> account status</span></div>
    <form key={vendor.product_ids.join("|")} onSubmit={saveAssignments}>
      <ProductChecklist products={products} name="productIds" legend="Visible products" selected={vendor.product_ids} />
      <button className="admin-button primary"><Save/>Save assignments</button>
    </form>
    <div className="decision-actions">
      {vendor.status !== "SUSPENDED" && <button onClick={() => void act({ action: "reset", userId: vendor.user_id })}><KeyRound/>{vendor.status === "INVITED" ? "Send new activation" : "Reset password"}</button>}
      {vendor.status === "ACTIVE" && <button onClick={() => void act({ action: "status", userId: vendor.user_id, status: "SUSPENDED" })}>Suspend portal</button>}
      {vendor.status === "SUSPENDED" && <button onClick={() => void act({ action: "status", userId: vendor.user_id, status: "ACTIVE" })}>Activate portal</button>}
    </div>
    <small>{vendor.last_seen_at ? `Last signed in ${new Date(vendor.last_seen_at).toLocaleString()}` : "Never signed in"}</small>
  </article>;
}

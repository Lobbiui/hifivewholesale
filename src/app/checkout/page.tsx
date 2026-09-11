"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Check, CheckCircle2, MapPin, Minus, PackageCheck, Plus, ShieldCheck, Trash2, Truck } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { useLanguage } from "@/components/language-provider";

type BuyerIdentity = { applicationId: string | null; company: string; displayName: string; email: string };

export default function CheckoutPage() {
  const { items, total, remove, setQuantity, clear, pricingPending } = useCart();
  const { copy } = useLanguage();
  const [method, setMethod] = useState<"pickup" | "delivery">("pickup");
  const [buyer, setBuyer] = useState<BuyerIdentity | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submittedOrder, setSubmittedOrder] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/buyer/auth/session", { cache: "no-store" }).then(async response => {
      if (!active || !response.ok) return;
      const result = await response.json() as { buyer: BuyerIdentity };
      setBuyer(result.buyer);
      setEmail(result.buyer.email);
    });
    return () => { active = false; };
  }, []);

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const approvedBuyer = buyer;
    if (!approvedBuyer) return setMessage(copy.checkout.approvedOnly);
    if (!items.length) return setMessage("Add at least one case before submitting your order.");
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/buyer/order-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ id, quantity }) => ({ id, quantity })),
          method,
          contactEmail: String(form.get("email") || approvedBuyer.email),
          purchaseOrder: String(form.get("purchaseOrder") || ""),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json() as { message?: string; order?: { orderNumber: string } };
      if (!response.ok || !result.order) {
        setMessage(result.message || "The order could not be submitted.");
        return;
      }
      clear();
      setSubmittedOrder(result.order.orderNumber);
    } catch {
      setMessage("The order service is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedOrder) return <main className="page-shell light-page checkout-page"><section className="order-confirmation container"><CheckCircle2/><span className="eyebrow">Approved buyer order received</span><h1>ORDER<br/>SUBMITTED.</h1><p><strong>{submittedOrder}</strong> has been sent for wholesale review. Your account representative will confirm pricing and fulfillment before payment.</p><div><Link className="button primary" href="/account">View buyer account</Link><Link className="button dark" href="/shop">Continue shopping</Link></div></section></main>;

  return <main className="page-shell light-page checkout-page">
    <header className="simple-head container"><span className="eyebrow">{copy.checkout.kicker}</span><h1>{copy.checkout.title}</h1><p className="approved-order-note"><ShieldCheck/>Purchasing is restricted to businesses approved by a Hi-Five administrator.</p></header>
    <section className="checkout-grid container">
      <div><h2>{copy.checkout.order}</h2>{items.length === 0 ? <div className="empty-cart"><PackageCheck/><h3>{copy.checkout.empty}</h3><p>{copy.checkout.emptyCopy}</p><Link className="button dark" href="/shop">{copy.checkout.shop}</Link></div> : items.map((item) => <article className="cart-row" key={item.id}>
        <div className="mini-pack" style={{ background: item.color }}><Image src={item.images[0]} alt="" fill sizes="70px"/></div>
        <div><span>{item.brand}</span><h3>{item.name}</h3><small>{item.strength}</small><div className="cart-quantity" aria-label={`Case quantity for ${item.name}`}><button onClick={() => setQuantity(item.id, item.quantity - 1)} aria-label="Decrease case quantity"><Minus/></button><strong>{item.quantity}</strong><button onClick={() => setQuantity(item.id, item.quantity + 1)} aria-label="Increase case quantity"><Plus/></button><small>{item.quantity === 1 ? "case" : "cases"}</small></div></div>
        <strong>{item.casePrice === null ? "Account pricing" : `$${(item.casePrice * item.quantity).toFixed(2)}`}</strong>
        <button onClick={() => remove(item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={16}/></button>
      </article>)}</div>
      <form className="checkout-card" onSubmit={submitOrder}>
        <span className="eyebrow">{copy.checkout.fulfillment}</span><h2>{copy.checkout.question}</h2>
        <div className="method-grid"><button type="button" className={method === "pickup" ? "selected" : ""} onClick={() => setMethod("pickup")}><MapPin/><strong>{copy.checkout.pickup}</strong><small>{copy.checkout.pickupTime}</small>{method === "pickup" && <Check/>}</button><button type="button" className={method === "delivery" ? "selected" : ""} onClick={() => setMethod("delivery")}><Truck/><strong>{copy.checkout.delivery}</strong><small>{copy.checkout.deliveryTime}</small>{method === "delivery" && <Check/>}</button></div>
        <div className="approved-business"><ShieldCheck/><div><small>Approved business</small><strong>{buyer?.company || "Verifying account…"}</strong></div></div>
        <label>{copy.checkout.email}<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label>
        <label>{copy.checkout.po}<input name="purchaseOrder" placeholder={copy.checkout.optional}/></label>
        <div className="total-row"><span>{pricingPending ? copy.checkout.total : "Estimated total"}</span><strong>{pricingPending ? copy.checkout.accountPricing : `$${total.toFixed(2)}`}</strong></div>
        {message && <div className="checkout-error" role="alert">{message}</div>}
        <button className="button primary full" disabled={!buyer || !items.length || submitting}>{submitting ? "Submitting…" : copy.checkout.submit}</button>
        <small className="integration-note">Approval is re-validated when the order is submitted. Account pricing is confirmed before Authorize.net payment.</small>
      </form>
    </section>
  </main>;
}

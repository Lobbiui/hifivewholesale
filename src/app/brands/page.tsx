"use client";

import { ArrowRight, BadgeCheck, BarChart3, Boxes, CheckCircle2, Globe2, Handshake, PackageSearch, Store } from "lucide-react";
import { useState } from "react";

export type BrandApplication = {
  id: string;
  brand: string;
  contact: string;
  email: string;
  website: string;
  categories: string;
  markets: string;
  volume: string;
  message: string;
  status: "New" | "Review" | "Samples requested" | "Approved" | "Declined";
  submitted: string;
};

export default function BrandsPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const submit = async (form: FormData) => {
    setError("");
    const response = await fetch("/api/brand-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const result = await response.json() as { message?: string };
    if (!response.ok) return setError(result.message || "The application could not be submitted.");
    setSubmitted(true);
  };

  return <main className="page-shell brand-page">
    <header className="page-hero brand-hero"><div><span className="eyebrow light">Brand partnerships</span><h1>PUT YOUR BRAND<br/>IN MORE HANDS.</h1><p>Connect with the Hi-Five buying team to explore wholesale placement, territory growth, retailer introductions, and long-term distribution support.</p><a href="#brand-application" className="button primary">Introduce your brand <ArrowRight/></a></div><div className="brand-hero-card"><span>Hi-Five brand network</span><strong>YOUR PRODUCT</strong><i>+</i><strong>OUR RETAILERS</strong><small>One wholesale relationship built to move.</small></div></header>
    <section className="brand-proof"><div><Store/><strong>Retail access</strong><span>Reach qualified independent buyers</span></div><div><Boxes/><strong>Wholesale operations</strong><span>Case pricing and inventory support</span></div><div><Globe2/><strong>Territory growth</strong><span>Market-aware distribution planning</span></div><div><BarChart3/><strong>Sell-through focus</strong><span>Performance and reorder visibility</span></div></section>
    <section className="section container"><div className="section-heading"><div><span className="eyebrow">Why partner with Hi-Five</span><h2>MORE THAN<br/><em>A SHELF.</em></h2></div><p>We evaluate brand fit, retailer demand, pricing structure, fulfillment readiness, and territory opportunity—then build a practical route into the wholesale catalog.</p></div><div className="brand-process"><article><span>01</span><PackageSearch/><h3>Product review</h3><p>Share your line, categories, certifications, pricing, and wholesale readiness.</p></article><article><span>02</span><Handshake/><h3>Commercial fit</h3><p>Align on margins, territories, volume expectations, and retailer positioning.</p></article><article><span>03</span><BadgeCheck/><h3>Approved launch</h3><p>Onboard products, media, SKUs, fulfillment rules, and sales support.</p></article></div></section>
    <section id="brand-application" className="brand-application"><div><span className="eyebrow light">Meet the buying team</span><h2>LET’S SEE WHAT<br/>YOUR BRAND CAN DO.</h2><p>Applications enter the Brand Pipeline inside both Hi-Five admin workspaces. The buying team can review details, request samples, add notes, and approve onboarding.</p></div>{submitted ? <div className="brand-success"><CheckCircle2/><h3>INTRODUCTION RECEIVED.</h3><p>Your application was securely saved for the Hi-Five buying team.</p><button className="button white" onClick={() => setSubmitted(false)}>Submit another brand</button></div> : <form action={submit}>{error&&<div className="gate-message">{error}</div>}<div className="field-grid"><label>Brand name<input name="brand" required /></label><label>Contact name<input name="contact" required /></label><label>Business email<input name="email" type="email" required /></label><label>Website<input name="website" type="url" placeholder="https://" required /></label><label>Product categories<input name="categories" placeholder="Pouches, e-liquid, accessories…" required /></label><label>Current markets<input name="markets" placeholder="States, countries, territories" required /></label><label className="full-field">Current monthly wholesale volume<select name="volume" required><option value="">Select a range</option><option>Pre-launch</option><option>Under $25,000</option><option>$25,000–$100,000</option><option>$100,000+</option></select></label><label className="full-field">Why is this a fit?<textarea name="message" rows={5} required /></label></div><button className="button primary full">Send to the buying team <ArrowRight/></button><small>Product samples and documentation may be requested during review.</small></form>}</section>
  </main>;
}

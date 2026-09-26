"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Building2, LockKeyhole, PackageCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";

export type { AccessApplication } from "@/lib/wholesale-preview";

export function WholesaleAccessGate() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "apply">("login");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const login = async (form: FormData) => {
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/buyer/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") || ""), password: String(form.get("password") || "") }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message || "Buyer sign-in failed.");
        return;
      }
      const requested = new URLSearchParams(window.location.search).get("returnTo");
      router.replace(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/");
      router.refresh();
    } catch {
      setMessage("The buyer sign-in service is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  const apply = async (form: FormData) => {
    const email = String(form.get("email") || "");
    setSubmitting(true);
    setMessage("");
    const payload = {
      company: String(form.get("company") || ""),
      contact: String(form.get("contact") || ""),
      email,
      phone: String(form.get("phone") || ""),
      resaleId: String(form.get("resaleId") || ""),
      territory: String(form.get("territory") || ""),
      businessType: String(form.get("businessType") || ""),
      website: String(form.get("website") || ""),
      certified: form.get("certified") === "on",
    };

    let response: Response;
    try {
      response = await fetch("/api/access-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setMessage("We could not submit the application right now. Please try again shortly.");
      setSubmitting(false);
      return;
    }

    const result = await response.json() as {
      ok: boolean;
      message?: string;
      application?: { id: string; submitted: string; status: "Pending" | "Approved" };
    };
    if (!response.ok || !result.application) {
      setMessage(result.message || "Please review the application and try again.");
      setSubmitting(false);
      return;
    }

    setMessage(result.application.status === "Approved" ? "This business is already approved. Sign in with the buyer account password." : "Business application received. An admin must verify and approve it before catalog access or purchasing is enabled.");
    setMode("login");
    setSubmitting(false);
  };
  const resetPassword=async()=>{const email=window.prompt("Approved business email");if(!email)return;const response=await fetch("/api/auth/password-reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});const result=await response.json() as {message?:string};setMessage(result.message||"Password reset request received.")};

  return <main className="wholesale-gate">
    <section className="gate-visual">
      <div className="gate-wave-logo" role="img" aria-label="Hi-Five Supply Wholesale">
        <video src="/videos/hifive-logo-wave.mp4" autoPlay muted playsInline loop preload="auto" aria-hidden="true" />
      </div>
      <div><span className="eyebrow light">Private wholesale network</span><h1>THE GOOD STUFF<br/><em>STAYS GATED.</em></h1><p>Hi-Five is a business-to-business wholesale portal. Catalog, case pricing, inventory, checkout, and loyalty benefits are available only to approved accounts.</p></div>
      <div className="gate-proof"><span><ShieldCheck/>Wholesaler approved</span><span><LockKeyhole/>Private case pricing</span><span><PackageCheck/>Verified business buyers</span></div>
    </section>
    <section className="gate-panel">
      <div className="gate-card">
        <span className="eyebrow">Wholesale access</span>
        <h2>{mode === "login" ? "APPROVED BUYER SIGN-IN" : "REQUEST BUYER ACCESS"}</h2>
        <div className="gate-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Sign in</button><button className={mode === "apply" ? "active" : ""} onClick={() => { setMode("apply"); setMessage(""); }}>Apply</button></div>
        {message && <div className="gate-message">{message}</div>}
        {mode === "login" ? <form action={login}>
          <label>Approved business email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button primary full" disabled={submitting}>{submitting ? "Signing in…" : "Enter buyer portal"} {!submitting && <ArrowRight/>}</button>
          <button type="button" className="link-button" onClick={()=>void resetPassword()}>Forgot password?</button>
          <small className="demo-note"><BadgeCheck/>Access is limited to administrator-approved businesses.</small>
        </form> : <form action={apply}>
          <div className="field-grid"><label>Legal business name<input name="company" required /></label><label>Contact name<input name="contact" required /></label><label>Business email<input name="email" type="email" required /></label><label>Business phone<input name="phone" type="tel" required /></label><label>Resale certificate / tax ID<input name="resaleId" required /></label><label>Primary territory<input name="territory" required /></label><label>Business type<select name="businessType" required defaultValue=""><option value="" disabled>Select business type</option><option>Retail store</option><option>Multi-location retailer</option><option>Distributor</option><option>Online retailer</option></select></label><label>Business website<input name="website" type="url" placeholder="https://" /></label></div>
          <label className="business-certification"><input name="certified" type="checkbox" required/><span>I certify that I represent a legitimate business purchasing products for resale and that the information supplied may be verified by Hi-Five.</span></label>
          <button className="button primary full" disabled={submitting}>{submitting ? "Submitting…" : "Submit for approval"} {!submitting && <ArrowRight/>}</button>
        </form>}
        <div className="brand-entry"><Building2/><div><b>Are you a brand?</b><p>Introduce your products to the Hi-Five wholesale buying team.</p></div><Link href="/brands">Brand partnerships <ArrowRight/></Link></div>
        <div className="gate-legal"><Link href="/terms">Terms</Link><Link href="/contact">Contact wholesale</Link></div>
      </div>
    </section>
  </main>;
}

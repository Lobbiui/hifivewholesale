"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, LockKeyhole, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export type AccessApplication = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  resaleId: string;
  territory: string;
  status: "Pending" | "Approved" | "Declined";
  submitted: string;
};

const ACCESS_KEY = "hifive-wholesale-access";
const APPLICATIONS_KEY = "hifive-access-applications";

export function WholesaleAccessGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [approved, setApproved] = useState(false);
  const [mode, setMode] = useState<"login" | "apply">("login");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setApproved(sessionStorage.getItem(ACCESS_KEY) === "approved");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) return null;
  if (approved) return children;

  const login = (form: FormData) => {
    const email = String(form.get("email") || "").toLowerCase();
    const code = String(form.get("code") || "");
    const applications = JSON.parse(localStorage.getItem(APPLICATIONS_KEY) || "[]") as AccessApplication[];
    const approvedApplicant = applications.some((item) => item.email.toLowerCase() === email && item.status === "Approved");
    if ((email === "buyer@hifivesupply.com" && code === "HIFIVE-DEMO") || approvedApplicant) {
      sessionStorage.setItem(ACCESS_KEY, "approved");
      setApproved(true);
      return;
    }
    setMessage("This account is not approved yet. Submit an access request or contact the wholesale desk.");
  };

  const apply = (form: FormData) => {
    const email = String(form.get("email") || "");
    const current = JSON.parse(localStorage.getItem(APPLICATIONS_KEY) || "[]") as AccessApplication[];
    const application: AccessApplication = {
      id: `WA-${Date.now().toString().slice(-6)}`,
      company: String(form.get("company") || ""),
      contact: String(form.get("contact") || ""),
      email,
      phone: String(form.get("phone") || ""),
      resaleId: String(form.get("resaleId") || ""),
      territory: String(form.get("territory") || ""),
      status: "Pending",
      submitted: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify([application, ...current.filter((item) => item.email !== email)]));
    setMessage("Application received. Hi-Five must approve the account before catalog access is enabled.");
    setMode("login");
  };

  return <main className="wholesale-gate">
    <section className="gate-visual">
      <Image src="/images/hifive-logo.png" alt="Hi-Five Supply Wholesale" width={230} height={125} priority />
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
          <label>Approved business email<input name="email" type="email" defaultValue="buyer@hifivesupply.com" required /></label>
          <label>Access code<input name="code" defaultValue="HIFIVE-DEMO" required /></label>
          <button className="button primary full">Enter buyer portal <ArrowRight/></button>
          <small className="demo-note"><BadgeCheck/>Client preview credentials are prefilled.</small>
        </form> : <form action={apply}>
          <div className="field-grid"><label>Business name<input name="company" required /></label><label>Contact name<input name="contact" required /></label><label>Business email<input name="email" type="email" required /></label><label>Phone<input name="phone" type="tel" required /></label><label>Resale certificate / ID<input name="resaleId" required /></label><label>Primary territory<input name="territory" required /></label></div>
          <button className="button primary full">Submit for approval <ArrowRight/></button>
        </form>}
        <div className="brand-entry"><Building2/><div><b>Are you a brand?</b><p>Introduce your products to the Hi-Five wholesale buying team.</p></div><Link href="/brands">Brand partnerships <ArrowRight/></Link></div>
        <div className="gate-legal"><Link href="/terms">Terms</Link><Link href="/contact">Contact wholesale</Link></div>
      </div>
    </section>
  </main>;
}


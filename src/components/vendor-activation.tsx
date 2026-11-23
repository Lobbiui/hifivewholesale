"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function VendorActivation({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activate = async (form: FormData) => {
    setSubmitting(true);
    setMessage("");
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmation") || "")) { setMessage("The passwords do not match."); setSubmitting(false); return; }
    try {
      const response = await fetch("/api/vendor/auth/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) { setMessage(result.message || "The vendor account could not be activated."); return; }
      router.replace("/vendor");
      router.refresh();
    } catch { setMessage("The activation service is temporarily unavailable."); }
    finally { setSubmitting(false); }
  };
  return <main className="wholesale-gate"><section className="gate-visual"><Image src="/images/hifive-logo-black-banner.png" alt="HiFive Supply" width={230} height={125} priority/><div><span className="eyebrow light">Private vendor access</span><h1>VIEW YOUR<br/><em>HIFIVE PRODUCTS.</em></h1><p>Create your private password for the read-only vendor portal.</p></div><div className="gate-proof"><span><ShieldCheck/>One-time secure activation</span></div></section><section className="gate-panel"><div className="gate-card"><span className="eyebrow">Vendor portal activation</span><h2>CREATE YOUR PASSWORD</h2>{message && <div className="gate-message">{message}</div>}{token ? <form action={activate}><label>New password<input name="password" type="password" minLength={12} autoComplete="new-password" required/></label><label>Confirm password<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required/></label><button className="button primary full" disabled={submitting}>{submitting ? "Activating..." : "Activate vendor portal"}{!submitting && <ArrowRight/>}</button><small className="demo-note">Use at least 12 characters with a letter, number, and special character. This link expires in 24 hours.</small></form> : <div className="gate-message">This activation link is incomplete.</div>}</div></section></main>;
}

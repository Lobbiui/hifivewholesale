"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

export function BuyerActivation({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activate = async (form: FormData) => {
    setSubmitting(true);
    setMessage("");
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      setSubmitting(false);
      return;
    }
    try {
      const response = await fetch("/api/buyer/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message || "The account could not be activated.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("The activation service is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="wholesale-gate"><section className="gate-visual"><Image src="/images/hifive-logo.png" alt="Hi-Five Supply Wholesale" width={230} height={125} priority/><div><span className="eyebrow light">Approved wholesale account</span><h1>WELCOME TO<br/><em>HI-FIVE.</em></h1><p>Create your private buyer password to unlock catalog pricing, ordering, and account history.</p></div><div className="gate-proof"><span><ShieldCheck/>Administrator approved</span></div></section><section className="gate-panel"><div className="gate-card"><span className="eyebrow">Account activation</span><h2>CREATE YOUR PASSWORD</h2>{message&&<div className="gate-message">{message}</div>}{token?<form action={activate}><label>New password<input name="password" type="password" minLength={12} required/></label><label>Confirm password<input name="confirmation" type="password" minLength={12} required/></label><button className="button primary full" disabled={submitting}>{submitting?"Activating…":"Activate buyer account"}{!submitting&&<ArrowRight/>}</button><small className="demo-note">Use at least 12 characters with a letter, number, and special character.</small></form>:<div className="gate-message">This activation link is incomplete.</div>}</div></section></main>;
}

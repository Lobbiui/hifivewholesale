"use client";

import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function AgeGate() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(localStorage.getItem("hifive-age-confirmed") !== "1");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!ready || !visible) return null;
  return <div className="age-gate"><div className="age-card"><Image src="/images/hifive-logo.png" alt="Hi-Five Supply" width={205} height={111}/><span className="eyebrow">Age confirmation</span><h2>ARE YOU OF LEGAL PURCHASING AGE?</h2><p>This wholesale experience contains age-restricted product categories. Confirm that you meet the legal age requirements in your jurisdiction.</p><div><button className="button primary" onClick={() => { localStorage.setItem("hifive-age-confirmed", "1"); setVisible(false); }}>Yes, enter site</button><a className="button dark" href="https://google.com">No, exit</a></div><small><ShieldCheck/>AgeChecker.net connection point is prepared for the production verification phase.</small></div></div>;
}

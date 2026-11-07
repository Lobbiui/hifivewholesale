"use client";

import { CreditCard, Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type PaymentConfig = { enabled: boolean; apiLoginId: string; publicClientKey: string; scriptUrl: string };
type AcceptResponse = { opaqueData?: { dataDescriptor: string; dataValue: string }; messages?: { resultCode?: string; message?: { text?: string }[] } };

declare global { interface Window { hiFiveManualInvoicePayment?: (response: AcceptResponse) => void } }

export function BuyerInvoicePayment({ invoiceId, amount, payable, onPaid }: { invoiceId: string; amount: number | null; payable: boolean; onPaid: () => void }) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const attempt = useRef("");
  useEffect(() => { let active = true; void fetch("/api/buyer/payments/authorize-net/config", { cache: "no-store" }).then(async (response) => { if (active && response.ok) setConfig(await response.json()); }); return () => { active = false; }; }, []);
  const process = useCallback(async (opaqueData: { dataDescriptor: string; dataValue: string }) => {
    attempt.current ||= crypto.randomUUID(); setSubmitting(true); setMessage("");
    try {
      const response = await fetch(`/api/buyer/manual-invoices/${encodeURIComponent(invoiceId)}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: attempt.current, opaqueData }) });
      const result = await response.json() as { message?: string };
      setMessage(result.message || (response.ok ? "Invoice paid." : "Payment could not be completed."));
      if (response.ok) onPaid(); else if (response.status !== 502 && response.status !== 409) attempt.current = "";
    } catch { setMessage("The payment response could not be confirmed. Contact HiFive before trying again."); }
    finally { setSubmitting(false); }
  }, [invoiceId, onPaid]);
  const primePaymentHandler = () => {
    window.hiFiveManualInvoicePayment = (response) => {
      if (response.messages?.resultCode === "Error" || !response.opaqueData) {
        setMessage(response.messages?.message?.[0]?.text || "The secure card form could not tokenize this payment.");
        return;
      }
      void process(response.opaqueData);
    };
  };
  useEffect(() => { if (!config?.enabled || !config.scriptUrl) return; const existing = document.getElementById("authorize-net-manual-invoice"); if (existing) return; const script = document.createElement("script"); script.id = "authorize-net-manual-invoice"; script.src = config.scriptUrl; script.async = false; script.onerror = () => setMessage("The secure Authorize.net form could not be loaded."); document.body.appendChild(script); }, [config]);
  return <div className="buyer-invoice-actions"><a className="button dark" href={`/api/buyer/manual-invoices/${encodeURIComponent(invoiceId)}/pdf`} download><Download/>Invoice PDF</a>{payable && config?.enabled ? <button type="button" className="AcceptUI button primary" disabled={submitting} onPointerDown={primePaymentHandler} onFocus={primePaymentHandler} data-billingaddressoptions='{"show":true,"required":true}' data-apiloginid={config.apiLoginId} data-clientkey={config.publicClientKey} data-acceptuiformbtntxt={`Pay $${(amount ?? 0).toFixed(2)}`} data-acceptuiformheadertxt="Pay HiFive invoice" data-paymentoptions='{"showCreditCard":true,"showBankAccount":false}' data-responsehandler="hiFiveManualInvoicePayment"><CreditCard/>{submitting ? "Processing…" : `Pay $${(amount ?? 0).toFixed(2)}`}</button> : null}{message ? <small>{message}</small> : null}</div>;
}

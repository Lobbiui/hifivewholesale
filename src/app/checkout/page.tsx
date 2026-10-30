"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { useLanguage } from "@/components/language-provider";

type BuyerIdentity = {
  applicationId: string | null;
  company: string;
  displayName: string;
  email: string;
};

type PaymentConfig = {
  configured: boolean;
  enabled: boolean;
  environment: "sandbox" | "production";
  apiLoginId: string;
  publicClientKey: string;
  scriptUrl: string;
};

type AcceptResponse = {
  opaqueData?: { dataDescriptor: string; dataValue: string };
  messages?: {
    resultCode?: string;
    message?: { code?: string; text?: string }[];
  };
};

declare global {
  interface Window {
    hiFiveAuthorizeNetResponse?: (response: AcceptResponse) => void;
  }
}

export default function CheckoutPage() {
  const {
    items,
    subtotal,
    hdcpTax,
    total,
    remove,
    setQuantity,
    clear,
    pricingPending,
    notice,
  } = useCart();
  const { copy } = useLanguage();
  const [method, setMethod] = useState<"pickup" | "delivery">("pickup");
  const [buyer, setBuyer] = useState<BuyerIdentity | null>(null);
  const [email, setEmail] = useState("");
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [message, setMessage] = useState("");
  const [submittedOrder, setSubmittedOrder] = useState("");
  const [submittedPayment, setSubmittedPayment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const paymentAttemptKey = useRef("");

  useEffect(() => {
    let active = true;
    void fetch("/api/buyer/auth/session", { cache: "no-store" }).then(
      async (response) => {
        if (!active || !response.ok) return;
        const result = (await response.json()) as { buyer: BuyerIdentity };
        setBuyer(result.buyer);
        setEmail(result.buyer.email);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!buyer) return;
    let active = true;
    void fetch("/api/buyer/payments/authorize-net/config", {
      cache: "no-store",
    }).then(async (response) => {
      if (!active) return;
      if (!response.ok) {
        setPaymentConfig({
          configured: false,
          enabled: false,
          environment: "production",
          apiLoginId: "",
          publicClientKey: "",
          scriptUrl: "",
        });
        return;
      }
      const result = (await response.json()) as PaymentConfig;
      setPaymentConfig(result);
    });
    return () => {
      active = false;
    };
  }, [buyer]);

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const approvedBuyer = buyer;
    if (!approvedBuyer) return setMessage(copy.checkout.approvedOnly);
    if (!items.length)
      return setMessage("Add at least one case before submitting your order.");
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/buyer/order-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ id, variantId, quantity }) => ({
            id,
            variantId,
            quantity,
          })),
          method,
          contactEmail: String(form.get("email") || approvedBuyer.email),
          purchaseOrder: String(form.get("purchaseOrder") || ""),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        order?: { orderNumber: string };
      };
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

  const processHostedPayment = useCallback(
    async (opaqueData: { dataDescriptor: string; dataValue: string }) => {
      const approvedBuyer = buyer;
      if (!approvedBuyer || !items.length || pricingPending || !email) {
        setMessage("Complete the checkout details before opening payment.");
        return;
      }
      paymentAttemptKey.current ||= crypto.randomUUID();
      setSubmitting(true);
      setMessage("");
      try {
        const response = await fetch("/api/buyer/payments/authorize-net", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ id, variantId, quantity }) => ({
              id,
              variantId,
              quantity,
            })),
            method,
            contactEmail: email,
            purchaseOrder,
            idempotencyKey: paymentAttemptKey.current,
            opaqueData,
          }),
        });
        const result = (await response.json()) as {
          message?: string;
          order?: { orderNumber: string; paymentStatus: string };
        };
        if (!response.ok || !result.order) {
          setMessage(result.message || "The payment could not be completed.");
          if (response.status !== 409 && response.status !== 502)
            paymentAttemptKey.current = "";
          return;
        }
        clear();
        setSubmittedPayment(result.order.paymentStatus);
        setSubmittedOrder(result.order.orderNumber);
      } catch {
        setMessage(
          "The payment response could not be confirmed. Do not submit again; contact HiFive so the transaction can be checked.",
        );
      } finally {
        setSubmitting(false);
      }
    }, [buyer, clear, email, items, method, pricingPending, purchaseOrder],
  );

  useEffect(() => {
    window.hiFiveAuthorizeNetResponse = (response: AcceptResponse) => {
      if (response.messages?.resultCode === "Error" || !response.opaqueData) {
        setMessage(
          response.messages?.message?.[0]?.text ||
            "The secure card form could not tokenize this payment.",
        );
        return;
      }
      void processHostedPayment(response.opaqueData);
    };
    return () => {
      delete window.hiFiveAuthorizeNetResponse;
    };
  }, [processHostedPayment]);

  useEffect(() => {
    if (!paymentConfig?.enabled || !paymentConfig.scriptUrl) return;
    const previous = document.getElementById("authorize-net-accept-ui");
    previous?.remove();
    const script = document.createElement("script");
    script.id = "authorize-net-accept-ui";
    script.src = paymentConfig.scriptUrl;
    script.async = false;
    script.onerror = () =>
      setMessage("The secure Authorize.net card form could not be loaded.");
    document.body.appendChild(script);
    return () => script.remove();
  }, [paymentConfig]);

  if (submittedOrder)
    return (
      <main className="page-shell light-page checkout-page">
        <section className="order-confirmation container">
          <CheckCircle2 />
          <span className="eyebrow">Approved buyer order received</span>
          <h1>
            ORDER
            <br />
            SUBMITTED.
          </h1>
          <p>
            <strong>{submittedOrder}</strong> has been sent for wholesale
            review. {submittedPayment === "APPROVED"
              ? "Payment was approved and the order is confirmed."
              : submittedPayment === "HELD"
                ? "Payment is being reviewed before fulfillment."
                : "Your account representative will confirm pricing and fulfillment."}
          </p>
          <div>
            <Link className="button primary" href="/account">
              View buyer account
            </Link>
            <Link className="button dark" href="/shop">
              Continue shopping
            </Link>
          </div>
        </section>
      </main>
    );

  return (
    <main className="page-shell light-page checkout-page">
      <header className="simple-head container">
        <span className="eyebrow">{copy.checkout.kicker}</span>
        <h1>{copy.checkout.title}</h1>
        <p className="approved-order-note">
          <ShieldCheck />
          Purchasing is restricted to businesses approved by a HiFive
          administrator.
        </p>
      </header>
      <section className="checkout-grid container">
        {notice && (
          <div className="checkout-error checkout-cart-notice" role="status">
            {notice}
          </div>
        )}
        <div>
          <h2>{copy.checkout.order}</h2>
          {items.length === 0 ? (
            <div className="empty-cart">
              <PackageCheck />
              <h3>{copy.checkout.empty}</h3>
              <p>{copy.checkout.emptyCopy}</p>
              <Link className="button dark" href="/shop">
                {copy.checkout.shop}
              </Link>
            </div>
          ) : (
            items.map((item) => (
              <article className="cart-row" key={item.cartKey}>
                <div className="mini-pack" style={{ background: item.color }}>
                  <Image src={item.images[0]} alt="" fill sizes="70px" />
                </div>
                <div>
                  <span>{item.brand}</span>
                  <h3>{item.name}</h3>
                  <small>
                    {item.flavor} · {item.strength}
                  </small>
                  <div
                    className="cart-quantity"
                    aria-label={`Case quantity for ${item.name}`}
                  >
                    <button
                      onClick={() =>
                        setQuantity(item.cartKey, item.quantity - 1)
                      }
                      aria-label="Decrease case quantity"
                    >
                      <Minus />
                    </button>
                    <strong>{item.quantity}</strong>
                    <button
                      onClick={() =>
                        setQuantity(item.cartKey, item.quantity + 1)
                      }
                      aria-label="Increase case quantity"
                    >
                      <Plus />
                    </button>
                    <small>{item.quantity === 1 ? "case" : "cases"}</small>
                  </div>
                </div>
                <strong>
                  {item.casePrice === null
                    ? "Account pricing"
                    : `$${(item.casePrice * item.quantity).toFixed(2)}`}
                </strong>
                <button
                  onClick={() => remove(item.cartKey)}
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))
          )}
        </div>
        <form className="checkout-card" onSubmit={submitOrder}>
          <span className="eyebrow">{copy.checkout.fulfillment}</span>
          <h2>{copy.checkout.question}</h2>
          <div className="method-grid">
            <button
              type="button"
              className={method === "pickup" ? "selected" : ""}
              onClick={() => setMethod("pickup")}
            >
              <MapPin />
              <strong>{copy.checkout.pickup}</strong>
              <small>{copy.checkout.pickupTime}</small>
              {method === "pickup" && <Check />}
            </button>
            <button
              type="button"
              className={method === "delivery" ? "selected" : ""}
              onClick={() => setMethod("delivery")}
            >
              <Truck />
              <strong>{copy.checkout.delivery}</strong>
              <small>{copy.checkout.deliveryTime}</small>
              {method === "delivery" && <Check />}
            </button>
          </div>
          <div className="approved-business">
            <ShieldCheck />
            <div>
              <small>Approved business</small>
              <strong>{buyer?.company || "Verifying account…"}</strong>
            </div>
          </div>
          <label>
            {copy.checkout.email}
            <input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {copy.checkout.po}
            <input
              name="purchaseOrder"
              placeholder={copy.checkout.optional}
              value={purchaseOrder}
              onChange={(event) => setPurchaseOrder(event.target.value)}
            />
          </label>
          <div className="total-row checkout-subtotal-row">
            <span>Merchandise subtotal</span>
            <strong>
              {pricingPending ? copy.checkout.accountPricing : `$${subtotal.toFixed(2)}`}
            </strong>
          </div>
          <div className="total-row checkout-tax-row">
            <span>TN HDCP tax</span>
            <strong>{pricingPending ? "Pending" : `$${hdcpTax.toFixed(2)}`}</strong>
          </div>
          <div className="total-row">
            <span>
              {pricingPending ? copy.checkout.total : "Order total"}
            </span>
            <strong>
              {pricingPending
                ? copy.checkout.accountPricing
                : `$${total.toFixed(2)}`}
            </strong>
          </div>
          {message && (
            <div className="checkout-error" role="alert">
              {message}
            </div>
          )}
          {paymentConfig === null ? (
            <button className="button primary full" type="button" disabled>
              Loading secure checkout…
            </button>
          ) : paymentConfig.enabled && !pricingPending ? (
            <button
              type="button"
              className="button primary full AcceptUI"
              disabled={!buyer || !items.length || !email || submitting}
              data-apiLoginID={paymentConfig.apiLoginId}
              data-clientKey={paymentConfig.publicClientKey}
              data-billingAddressOptions={JSON.stringify({
                show: true,
                required: true,
              })}
              data-paymentOptions={JSON.stringify({
                showCreditCard: true,
                showBankAccount: false,
              })}
              data-acceptUIFormBtnTxt="Pay securely"
              data-acceptUIFormHeaderTxt="HiFive secure payment"
              data-responseHandler="hiFiveAuthorizeNetResponse"
            >
              {submitting ? "Processing payment…" : `Pay $${total.toFixed(2)} securely`}
            </button>
          ) : (
            <button
              className="button primary full"
              disabled={!buyer || !items.length || submitting}
            >
              {submitting ? "Submitting…" : copy.checkout.submit}
            </button>
          )}
          <small className="integration-note">
            {paymentConfig?.enabled && !pricingPending
              ? "Card details are collected securely by Authorize.net and are never stored by HiFive. The final amount is recalculated by the server before charging."
              : "Approval is re-validated when the order is submitted. Account pricing is confirmed before payment."}
          </small>
        </form>
      </section>
    </main>
  );
}

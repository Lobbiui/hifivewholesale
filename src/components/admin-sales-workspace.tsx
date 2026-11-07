"use client";

import { Download, FilePlus2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type Line = {
  key: string;
  variantId: string;
  quantity: number;
  customPrice: string;
};
const text = (value: unknown) => String(value ?? "");
const number = (value: unknown) => Number(value ?? 0);
const money = (cents: unknown) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    number(cents) / 100,
  );

export function AdminSalesWorkspace() {
  const [data, setData] = useState<{
    role: string;
    profile: Row;
    customers: Row[];
    products: Row[];
    reps: Row[];
    invoices: Row[];
  }>({
    role: "",
    profile: {},
    customers: [],
    products: [],
    reps: [],
    invoices: [],
  });
  const [message, setMessage] = useState("Loading sales workspace…");
  const [customerId, setCustomerId] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: crypto.randomUUID(), variantId: "", quantity: 1, customPrice: "" },
  ]);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/manual-invoices", {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Sales workspace could not be loaded.");
    setData(result);
    setCustomerId((current) => current || text(result.customers?.[0]?.id));
    setMessage("");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch((error) => setMessage(error.message)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const canCustomPrice =
    data.role !== "SALES_REP" || Boolean(data.profile.custom_pricing_enabled);
  const selected = useMemo(
    () => new Map(data.products.map((row) => [text(row.variant_id), row])),
    [data.products],
  );
  const merchandise = lines.reduce((sum, line) => {
    const row = selected.get(line.variantId);
    const cents = line.customPrice
      ? Math.round(Number(line.customPrice) * 100)
      : number(row?.case_price_cents);
    return sum + cents * line.quantity;
  }, 0);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!customerId || lines.some((line) => !line.variantId)) {
      setMessage("Choose a customer and product for every line.");
      return;
    }
    setMessage("Issuing invoice…");
    const response = await fetch("/api/admin/manual-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        customerId,
        salesRepId: salesRepId || null,
        fulfillmentMethod: form.get("fulfillmentMethod"),
        purchaseOrder: form.get("purchaseOrder"),
        notes: form.get("notes"),
        shippingCents: Math.round(Number(form.get("shipping") || 0) * 100),
        items: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          customCasePriceCents:
            line.customPrice === ""
              ? null
              : Math.round(Number(line.customPrice) * 100),
        })),
      }),
    });
    const result = (await response.json()) as {
      message?: string;
      invoice?: { orderNumber: string };
    };
    if (!response.ok) {
      setMessage(result.message || "The invoice could not be issued.");
      return;
    }
    setMessage(
      `${result.invoice?.orderNumber || "Invoice"} issued and emailed to the customer.`,
    );
    setLines([
      { key: crypto.randomUUID(), variantId: "", quantity: 1, customPrice: "" },
    ]);
    await load();
  };
  const voidInvoice = async (id: string) => {
    if (!window.confirm("Void this unpaid invoice?")) return;
    const response = await fetch("/api/admin/manual-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", id }),
    });
    const result = (await response.json()) as { message?: string };
    setMessage(
      response.ok
        ? "Invoice voided."
        : result.message || "Invoice could not be voided.",
    );
    if (response.ok) await load();
  };
  const commissionTotal = data.invoices.reduce(
    (sum, row) => sum + number(row.commission_earned_cents),
    0,
  );
  return (
    <>
      <div className="admin-section-head">
        <div>
          <span className="eyebrow">Assigned-account sales</span>
          <h2>INVOICES & COMMISSIONS.</h2>
          <p>
            Select an approved customer, build an invoice from the live catalog,
            and issue it by email. Paid invoices enter the normal order and
            fulfillment workflow.
          </p>
        </div>
        <button className="admin-button" onClick={() => void load()}>
          <RefreshCw />
          Refresh
        </button>
      </div>
      {message && <div className="gate-message">{message}</div>}
      <div className="gate-message invoice-retention-notice">
        <b>30-day invoice retention</b>
        <span>
          Issued invoice PDFs and payment links expire 30 days after issuance.
          Download invoices before expiration. Order, payment, tax, refund, and
          commission history remains in reporting.
        </span>
      </div>
      <div className="report-grid">
        <article>
          <FilePlus2 />
          <small>Issued invoices</small>
          <strong>{data.invoices.length}</strong>
          <span>
            {data.role === "SALES_REP" ? "Your assigned accounts" : "All staff"}
          </span>
        </article>
        <article>
          <FilePlus2 />
          <small>Earned commission</small>
          <strong>{money(commissionTotal)}</strong>
          <span>Paid less refunded amounts</span>
        </article>
      </div>
      <form className="admin-card manual-invoice-form" onSubmit={submit}>
        <div className="admin-section-head">
          <div>
            <span className="eyebrow">Manual invoice builder</span>
            <h3>ISSUE A CUSTOMER INVOICE.</h3>
          </div>
        </div>
        <div className="operations-form">
          <label>
            Customer
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
            >
              <option value="">Choose an approved customer</option>
              {data.customers.map((row) => (
                <option key={text(row.id)} value={text(row.id)}>
                  {text(row.display_name)} · {text(row.email)}
                </option>
              ))}
            </select>
          </label>
          {data.role !== "SALES_REP" ? (
            <label>
              Commissioned sales rep
              <select
                value={salesRepId}
                onChange={(event) => setSalesRepId(event.target.value)}
              >
                <option value="">No commission / house account</option>
                {data.reps.map((row) => (
                  <option value={text(row.id)} key={text(row.id)}>
                    {text(row.display_name)} ·{" "}
                    {(number(row.commission_rate_bps) / 100).toFixed(2)}%
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Your commission rate
              <input
                value={`${(number(data.profile.commission_rate_bps) / 100).toFixed(2)}%`}
                disabled
              />
            </label>
          )}
          <label>
            Fulfillment
            <select name="fulfillmentMethod">
              <option value="DELIVERY">Delivery</option>
              <option value="PICKUP">Pickup</option>
            </select>
          </label>
          <label>
            Customer PO number
            <input name="purchaseOrder" maxLength={120} />
          </label>
          <label>
            Shipping charge ($)
            <input
              name="shipping"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label className="full-field">
            Invoice notes
            <textarea name="notes" rows={3} maxLength={4000} />
          </label>
        </div>
        <div className="manual-invoice-lines">
          <div className="manual-line-head">
            <b>Invoice items</b>
            <button
              type="button"
              className="admin-button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    variantId: "",
                    quantity: 1,
                    customPrice: "",
                  },
                ])
              }
            >
              <Plus />
              Add item
            </button>
          </div>
          {lines.map((line, index) => (
            <div className="manual-invoice-line" key={line.key}>
              <label>
                Product / option
                <select
                  value={line.variantId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key
                          ? { ...item, variantId: event.target.value }
                          : item,
                      ),
                    )
                  }
                  required
                >
                  <option value="">Choose product</option>
                  {data.products.map((row) => (
                    <option
                      key={text(row.variant_id)}
                      value={text(row.variant_id)}
                    >
                      {text(row.product_name)} — {text(row.variant_name)} ·{" "}
                      {row.case_price_cents == null
                        ? "Price required"
                        : money(row.case_price_cents)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cases
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item) =>
                        item.key === line.key
                          ? {
                              ...item,
                              quantity: Math.max(1, Number(event.target.value)),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              {canCustomPrice ? (
                <label>
                  Custom case price ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Use catalog price"
                    value={line.customPrice}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? { ...item, customPrice: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              ) : (
                <small>Catalog pricing enforced</small>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove item ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) =>
                    current.filter((item) => item.key !== line.key),
                  )
                }
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
        <div className="manual-invoice-total">
          <span>Merchandise estimate</span>
          <strong>{money(merchandise)}</strong>
          <small>
            TN HDCP tax and shipping are calculated and locked when the invoice
            is issued.
          </small>
        </div>
        <button className="admin-button primary">
          <FilePlus2 />
          Issue invoice & email customer
        </button>
      </form>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Sales rep</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Commission</th>
              <th>30-day document</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((row) => {
              const active = Boolean(row.invoice_available);
              return (
                <tr key={text(row.id)}>
                  <td>
                    <b>{text(row.order_number)}</b>
                    <small>
                      {text(row.invoice_status)} ·{" "}
                      {new Date(text(row.invoice_issued_at)).toLocaleString()}
                    </small>
                  </td>
                  <td>{text(row.customer)}</td>
                  <td>
                    {text(row.sales_rep) || "House account"}
                    <small>
                      {(number(row.commission_rate_bps) / 100).toFixed(2)}%
                    </small>
                  </td>
                  <td>{money(row.estimated_total_cents)}</td>
                  <td>{text(row.payment_status)}</td>
                  <td>{money(row.commission_earned_cents)}</td>
                  <td>
                    {active ? (
                      <>
                        <a
                          className="admin-button invoice-download"
                          href={`/api/admin/invoices/${encodeURIComponent(text(row.id))}`}
                          download
                        >
                          <Download />
                          PDF
                        </a>
                        <small>
                          Expires{" "}
                          {new Date(
                            text(row.invoice_expires_at),
                          ).toLocaleDateString()}
                        </small>
                        {text(row.payment_status) === "UNPAID" ? (
                          <button
                            className="link-button"
                            onClick={() => void voidInvoice(text(row.id))}
                          >
                            Void
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span className="admin-pill">Expired / void</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

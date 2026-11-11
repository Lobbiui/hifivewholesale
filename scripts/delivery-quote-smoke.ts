import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canIssueDeliveryInvoice, deliveryInvoiceTotalCents } from "../src/lib/delivery-quote";

assert.equal(
  deliveryInvoiceTotalCents({
    subtotalCents: 10_000,
    hdcpTaxCents: 500,
    salesTaxCents: 0,
    shippingCents: 1_250,
  }),
  11_750,
);
assert.equal(
  canIssueDeliveryInvoice({
    fulfillmentMethod: "DELIVERY",
    orderSource: "BUYER_CHECKOUT",
    paymentStatus: "UNPAID",
    state: "SUBMITTED_FOR_REVIEW",
  }),
  true,
);
assert.equal(
  canIssueDeliveryInvoice({
    fulfillmentMethod: "PICKUP",
    orderSource: "BUYER_CHECKOUT",
    paymentStatus: "UNPAID",
    state: "SUBMITTED_FOR_REVIEW",
  }),
  false,
);
assert.equal(
  canIssueDeliveryInvoice({
    fulfillmentMethod: "DELIVERY",
    orderSource: "MANUAL_INVOICE",
    paymentStatus: "UNPAID",
    state: "READY_FOR_CHECKOUT",
  }),
  false,
);
assert.throws(() =>
  deliveryInvoiceTotalCents({
    subtotalCents: 10_000,
    hdcpTaxCents: 500,
    salesTaxCents: 0,
    shippingCents: -1,
  }),
);

async function main() {
  const [checkout, paymentRoute, invoiceRoute] = await Promise.all([
    readFile("src/app/checkout/page.tsx", "utf8"),
    readFile("src/app/api/buyer/payments/authorize-net/route.ts", "utf8"),
    readFile("src/app/api/admin/delivery-invoices/route.ts", "utf8"),
  ]);
  assert.match(checkout, /Submit delivery order for quote/);
  assert.match(checkout, /method === "pickup"/);
  assert.match(paymentRoute, /Delivery orders must be quoted before payment/);
  assert.match(invoiceRoute, /DELIVERY_INVOICE_ISSUED/);
  assert.match(invoiceRoute, /CURRENT_TIMESTAMP\+INTERVAL '30 days'/);

  console.log("Delivery quote and final-invoice workflow passed.");
}

void main();

export type DeliveryInvoiceCandidate = {
  fulfillmentMethod: string;
  orderSource: string;
  paymentStatus: string;
  state: string;
};

export function canIssueDeliveryInvoice(order: DeliveryInvoiceCandidate) {
  return (
    order.fulfillmentMethod === "DELIVERY" &&
    order.orderSource === "BUYER_CHECKOUT" &&
    order.paymentStatus === "UNPAID" &&
    !["CONVERTED", "DECLINED"].includes(order.state)
  );
}

export function deliveryInvoiceTotalCents(input: {
  subtotalCents: number;
  hdcpTaxCents: number;
  salesTaxCents: number;
  shippingCents: number;
}) {
  const values = [
    input.subtotalCents,
    input.hdcpTaxCents,
    input.salesTaxCents,
    input.shippingCents,
  ];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Delivery invoice amounts must be non-negative cents.");
  }
  return values.reduce((sum, value) => sum + value, 0);
}

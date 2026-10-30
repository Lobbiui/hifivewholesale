import type { Product } from "@/lib/data";
import { calculateHdcpTax, type HdcpTaxCalculation } from "@/lib/hdcp-tax";

export type RequestedCatalogItem = {
  product: (Product & { variantId?: string; cartKey: string }) | undefined;
  quantity: number;
  tax: HdcpTaxCalculation | null;
};

export function priceRequestedCatalogItems(
  products: Product[],
  requests: { id: string; variantId?: string; quantity: number }[],
) {
  const catalog = new Map(products.map((product) => [product.id, product]));
  const items: RequestedCatalogItem[] = requests.map((request) => {
    const base = catalog.get(request.id);
    const variant = request.variantId
      ? base?.variants?.find((candidate) => candidate.id === request.variantId)
      : base?.variants?.[0];
    const product =
      base && variant
        ? {
            ...base,
            variantId: variant.id,
            cartKey: `${base.id}:${variant.id}`,
            flavor: variant.name,
            price: variant.price,
            casePrice: variant.casePrice,
            unitsPerCase: variant.unitsPerCase,
            hdcpTaxProfile: variant.hdcpTaxProfile,
            hdcpTaxValue: variant.hdcpTaxValue,
          }
        : base
          ? { ...base, variantId: undefined, cartKey: `${base.id}:default` }
          : undefined;
    const tax =
      product?.casePrice === null || product?.casePrice === undefined
        ? null
        : calculateHdcpTax({
            profile: product.hdcpTaxProfile,
            value: product.hdcpTaxValue,
            unitsPerCase: product.unitsPerCase,
            quantityCases: request.quantity,
            casePriceCents: Math.round(product.casePrice * 100),
          });
    return { product, quantity: request.quantity, tax };
  });
  const pricingPending = items.some(
    (item) => !item.product || item.product.casePrice === null || !item.tax,
  );
  const subtotalCents = pricingPending
    ? null
    : items.reduce((sum, item) => sum + item.tax!.lineSubtotalCents, 0);
  const hdcpTaxCents = pricingPending
    ? null
    : items.reduce((sum, item) => sum + item.tax!.totalTaxCents, 0);
  const totalCents =
    subtotalCents === null || hdcpTaxCents === null
      ? null
      : subtotalCents + hdcpTaxCents;
  return { items, pricingPending, subtotalCents, hdcpTaxCents, totalCents };
}

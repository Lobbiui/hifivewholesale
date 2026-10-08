"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Product, ProductVariant } from "@/lib/data";

export type CartItem = Product & {
  quantity: number;
  variantId?: string;
  cartKey: string;
};
type CartContextValue = {
  items: CartItem[];
  add: (product: Product, quantity?: number, variant?: ProductVariant) => void;
  remove: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  count: number;
  total: number;
  pricingPending: boolean;
  notice: string | null;
};
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/buyer/cart", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          const result = (await response.json()) as {
            items: CartItem[];
            removedUnavailable?: number;
          };
          setItems(result.items);
          setNotice(
            result.removedUnavailable
              ? `${result.removedUnavailable} unavailable cart item${result.removedUnavailable === 1 ? " was" : "s were"} removed. Please choose another flavor if needed.`
              : null,
          );
          setAuthenticated(true);
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    const clearBuyerCart = () => {
      setItems([]);
      setAuthenticated(false);
      setNotice(null);
    };
    window.addEventListener("hifive-buyer-session-change", clearBuyerCart);
    return () => {
      active = false;
      window.removeEventListener("hifive-buyer-session-change", clearBuyerCart);
    };
  }, []);
  useEffect(() => {
    if (!hydrated || !authenticated) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/buyer/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ id, variantId, quantity }) => ({
            id,
            variantId,
            quantity,
          })),
        }),
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [authenticated, hydrated, items]);
  const add = (product: Product, quantity = 1, variant?: ProductVariant) =>
    setItems((current) => {
      const variantId = variant?.id;
      const cartKey = `${product.id}:${variantId ?? "default"}`;
      return current.some((item) => item.cartKey === cartKey)
        ? current.map((item) =>
            item.cartKey === cartKey
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          )
        : [...current, { ...product, variantId, cartKey, quantity }];
    });
  const remove = (key: string) =>
    setItems((current) => current.filter((item) => item.cartKey !== key));
  const setQuantity = (key: string, quantity: number) =>
    setItems((current) =>
      quantity < 1
        ? current.filter((item) => item.cartKey !== key)
        : current.map((item) =>
            item.cartKey === key ? { ...item, quantity } : item,
          ),
    );
  const clear = () => setItems([]);
  const value = useMemo(
    () => ({
      items,
      add,
      remove,
      setQuantity,
      clear,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      total: items.reduce(
        (sum, item) => sum + (item.casePrice ?? 0) * item.quantity,
        0,
      ),
      pricingPending: items.some((item) => item.casePrice === null),
      notice,
    }),
    [items, notice],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}

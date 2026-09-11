"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/data";

type CartItem = Product & { quantity: number };
type CartContextValue = { items: CartItem[]; add: (product: Product, quantity?: number) => void; remove: (id: string) => void; setQuantity: (id: string, quantity: number) => void; clear: () => void; count: number; total: number; pricingPending: boolean };
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/buyer/cart", { cache: "no-store" }).then(async response => {
      if (!active) return;
      if (response.ok) {
        const result = await response.json() as { items: CartItem[] };
        setItems(result.items);
        setAuthenticated(true);
      }
    }).finally(() => { if (active) setHydrated(true); });
    const clearBuyerCart = () => { setItems([]); setAuthenticated(false); };
    window.addEventListener("hifive-buyer-session-change", clearBuyerCart);
    return () => { active = false; window.removeEventListener("hifive-buyer-session-change", clearBuyerCart); };
  }, []);
  useEffect(() => {
    if (!hydrated || !authenticated) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/buyer/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(({ id, quantity }) => ({ id, quantity })) }),
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [authenticated, hydrated, items]);
  const add = (product: Product, quantity = 1) => setItems((current) => current.some((item) => item.id === product.id) ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item) : [...current, { ...product, quantity }]);
  const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const setQuantity = (id: string, quantity: number) => setItems((current) => quantity < 1 ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, quantity } : item));
  const clear = () => setItems([]);
  const value = useMemo(() => ({ items, add, remove, setQuantity, clear, count: items.reduce((sum, item) => sum + item.quantity, 0), total: items.reduce((sum, item) => sum + (item.casePrice ?? 0) * item.quantity, 0), pricingPending: items.some((item) => item.casePrice === null) }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}

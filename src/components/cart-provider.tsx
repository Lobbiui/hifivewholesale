"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Product } from "@/lib/data";

type CartItem = Product & { quantity: number };
type CartContextValue = { items: CartItem[]; add: (product: Product) => void; remove: (id: string) => void; count: number; total: number };
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const add = (product: Product) => setItems((current) => current.some((item) => item.id === product.id) ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }]);
  const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const value = useMemo(() => ({ items, add, remove, count: items.reduce((sum, item) => sum + item.quantity, 0), total: items.reduce((sum, item) => sum + item.casePrice * item.quantity, 0) }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}


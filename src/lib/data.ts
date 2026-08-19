export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  strength: string;
  flavor: string;
  price: number;
  casePrice: number;
  color: string;
  accent: string;
  badge?: string;
};

export const products: Product[] = [
  { id: "midnight-mint", name: "Midnight Mint", brand: "North Standard", category: "Pouches", strength: "6 mg", flavor: "Cool Mint", price: 5.49, casePrice: 109.8, color: "#16131d", accent: "#9b4dff", badge: "Best seller" },
  { id: "purple-rush", name: "Purple Rush", brand: "Highline", category: "Disposables", strength: "5%", flavor: "Grape Ice", price: 9.75, casePrice: 195, color: "#4d167c", accent: "#f0d7ff", badge: "New" },
  { id: "citrus-current", name: "Citrus Current", brand: "Volt", category: "Pouches", strength: "9 mg", flavor: "Citrus", price: 5.95, casePrice: 119, color: "#f0be2e", accent: "#fff4bd" },
  { id: "arctic-wave", name: "Arctic Wave", brand: "North Standard", category: "Disposables", strength: "5%", flavor: "Menthol", price: 10.25, casePrice: 205, color: "#eaf9ff", accent: "#54d7ff" },
  { id: "berry-static", name: "Berry Static", brand: "Highline", category: "E-Liquid", strength: "3 mg", flavor: "Mixed Berry", price: 11.5, casePrice: 138, color: "#ad1f76", accent: "#ffb9e4", badge: "Fast mover" },
  { id: "gold-leaf", name: "Gold Leaf", brand: "Reserve", category: "Accessories", strength: "Standard", flavor: "Classic", price: 7.25, casePrice: 87, color: "#b68120", accent: "#ffe4a5" },
];

export const posts = [
  { slug: "merchandising-fast-movers", tag: "Retail playbook", title: "Build a shelf that moves product", excerpt: "A practical guide to assortment, strength ladders, and the visual rhythm that helps customers decide faster." },
  { slug: "wholesale-margin-guide", tag: "Wholesale intelligence", title: "Margin without the mystery", excerpt: "How case tiers, reorder points, and smarter bundles create healthier turns for independent retailers." },
  { slug: "delivery-pickup", tag: "Operations", title: "Pickup or delivery? Make both feel premium", excerpt: "The small fulfillment details that turn a routine wholesale order into a reason to reorder." },
];


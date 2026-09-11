import catalog from "./catalog.generated.json";

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  strength: string;
  flavor: string;
  format: string;
  description: string;
  price: number | null;
  casePrice: number | null;
  color: string;
  accent: string;
  badge?: string;
  images: string[];
  coa: string[];
  brandLogo: string;
  sourceUrl: string;
};

export const products = catalog as Product[];

export const posts = [
  { slug: "merchandising-fast-movers", tag: "Retail playbook", title: "Build a shelf that moves product", excerpt: "A practical guide to assortment, strength ladders, and the visual rhythm that helps customers decide faster." },
  { slug: "wholesale-margin-guide", tag: "Wholesale intelligence", title: "Margin without the mystery", excerpt: "How case tiers, reorder points, and smarter bundles create healthier turns for independent retailers." },
  { slug: "delivery-pickup", tag: "Operations", title: "Pickup or delivery? Make both feel premium", excerpt: "The small fulfillment details that turn a routine wholesale order into a reason to reorder." },
];

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product-detail";
import { products } from "@/lib/data";

export function generateStaticParams() {
  return products.map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: PageProps<"/shop/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = products.find((item) => item.id === id);
  return product ? { title: `${product.name} | Hi-Five Wholesale`, description: `${product.brand} ${product.name}, ${product.flavor}, ${product.strength}. Wholesale case ordering for approved buyers.` } : {};
}

export default async function ProductPage({ params }: PageProps<"/shop/[id]">) {
  const { id } = await params;
  const product = products.find((item) => item.id === id);
  if (!product) notFound();
  return <ProductDetail product={product}/>;
}


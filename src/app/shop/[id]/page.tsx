import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product-detail";
import { getStorefrontProduct, getStorefrontProducts } from "@/lib/server/catalog";

export async function generateMetadata({ params }: PageProps<"/shop/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getStorefrontProduct(id);
  return product ? { title: `${product.name} | Hi-Five Wholesale`, description: `${product.brand} ${product.name}, ${product.flavor}, ${product.strength}. Wholesale case ordering for approved buyers.` } : {};
}

export default async function ProductPage({ params }: PageProps<"/shop/[id]">) {
  const { id } = await params;
  const product = await getStorefrontProduct(id);
  if (!product) notFound();
  const products = await getStorefrontProducts();
  const related = products.filter((item) => item.id !== product.id && (item.category === product.category || item.brand === product.brand)).slice(0, 3);
  return <ProductDetail product={product} related={related}/>;
}

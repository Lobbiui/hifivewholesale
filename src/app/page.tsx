import { HomePage } from "@/components/home-page";
import { getStorefrontProducts } from "@/lib/server/catalog";
export const dynamic = "force-dynamic";
export default async function Page(){ const products=await getStorefrontProducts(); return <HomePage products={products}/>; }

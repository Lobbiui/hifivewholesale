import { ShopCatalog } from "@/components/shop-catalog";
import { getStorefrontProducts } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";
export default async function ShopPage(){ const products=await getStorefrontProducts(); return <main className="page-shell shop-page"><header className="page-hero shop-hero"><span className="eyebrow light">Wholesale catalog</span><h1>FIND IT.<br/>STOCK IT. MOVE IT.</h1><p>Search the complete wholesale assortment by product, brand, category, flavor, or strength—then filter down to exactly what your shelves need.</p></header><ShopCatalog products={products}/></main> }

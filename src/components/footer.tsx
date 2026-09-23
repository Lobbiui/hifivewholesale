import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return <footer className="footer"><div className="footer-grid"><div><Image src="/images/hifive-logo.png" alt="Hi-Five Supply" width={210} height={114} /><p>Wholesale supply with better energy, faster decisions, and real support.</p></div><div><span>Shop</span><Link href="/shop">Catalog</Link><Link href="/loyalty">Hi-Five Rewards</Link><Link href="/checkout">Pickup & delivery</Link><Link href="/shipping">Shipping policy</Link></div><div><span>Company</span><Link href="/blog">Journal</Link><Link href="/contact">Contact us</Link><Link href="/terms">Terms of service</Link><Link href="/privacy">Privacy policy</Link><Link href="/returns">Returns & refunds</Link></div><div><span>Wholesale desk</span><a href="tel:+18005554445">1-800-555-HIFI</a><a href="mailto:wholesale@hifivesupply.com">wholesale@hifivesupply.com</a><small>Mon–Fri · 8am–6pm CT</small></div></div><div className="footer-bottom"><span>© 2026 Hi-Five Supply Wholesale</span><span>Approved business accounts only.</span></div></footer>;
}

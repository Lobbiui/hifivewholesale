import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <Image
            src="/images/hifive-logo-black-banner.png"
            alt="HiFive Supply"
            width={210}
            height={114}
          />
          <p>
            Wholesale supply with better energy, faster decisions, and real
            support.
          </p>
        </div>
        <div>
          <span>Shop</span>
          <Link href="/shop">Catalog</Link>
          <Link href="/loyalty">HiFive Rewards</Link>
          <Link href="/checkout">Pickup & delivery</Link>
          <Link href="/shipping">Shipping policy</Link>
        </div>
        <div>
          <span>Company</span>
          <Link href="/blog">Journal</Link>
          <Link href="/contact">Contact us</Link>
          <Link href="/terms">Terms of service</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/returns">Returns & refunds</Link>
        </div>
        <div>
          <span>Wholesale desk</span>
          <a href="tel:+16158408105">(615) 840-8105</a>
          <a href="mailto:hifivesupply@gmail.com">
            hifivesupply@gmail.com
          </a>
          <small>Mon–Fri · 9am–4pm</small>
          <small>
            4710 Old Hickory Blvd
            <br />
            Old Hickory, TN 37138
          </small>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 HiFive Supply Wholesale</span>
        <span>Approved business accounts only.</span>
      </div>
    </footer>
  );
}

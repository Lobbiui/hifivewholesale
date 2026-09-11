"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CheckCircle2, LogOut, PackageCheck, ShieldCheck } from "lucide-react";

type BuyerIdentity = { applicationId: string | null; company: string; displayName: string; email: string };
type BuyerOrder = { id:string;orderNumber:string;status:string;method:string;estimatedTotal:number|null;pricingPending:boolean;submitted:string;itemCount:number };

export default function BuyerAccountPage() {
  const router = useRouter();
  const [buyer, setBuyer] = useState<BuyerIdentity | null>(null);
  const [orders, setOrders] = useState<BuyerOrder[]>([]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/buyer/auth/session", { cache: "no-store" });
      if (active && response.ok) {
        const result = await response.json() as { buyer: BuyerIdentity };
        setBuyer(result.buyer);
      }
      const orderResponse = await fetch("/api/buyer/order-requests", { cache: "no-store" });
      if (active && orderResponse.ok) {
        const result = await orderResponse.json() as { orders: BuyerOrder[] };
        setOrders(result.orders);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const signOut = async () => {
    await fetch("/api/buyer/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("hifive-buyer-session-change"));
    router.replace("/");
    router.refresh();
  };

  return <main className="page-shell light-page account-page"><section className="account-hero container"><div><span className="eyebrow">Buyer account</span><h1>YOUR WHOLESALE<br/>COMMAND CENTER.</h1><p>Review business approval and submitted case orders from one private workspace.</p></div><div className="approval-card"><CheckCircle2/><small>Account status</small><strong>Approved business</strong><span>Catalog and ordering access enabled</span></div></section>
    <section className="account-grid container"><article className="account-business"><span className="eyebrow">Verified business</span><Building2/><h2>{buyer?.company || "Loading account…"}</h2><dl><div><dt>Buyer</dt><dd>{buyer?.displayName}</dd></div><div><dt>Business email</dt><dd>{buyer?.email}</dd></div><div><dt>Approval ID</dt><dd>{buyer?.applicationId}</dd></div></dl><div className="account-actions"><Link className="button primary" href="/shop">Shop catalog <ArrowRight/></Link><button className="button dark" onClick={signOut}><LogOut/>Sign out</button></div></article>
      <article className="account-orders"><div className="account-section-head"><div><span className="eyebrow">Order activity</span><h2>RECENT ORDERS.</h2></div><ShieldCheck/></div>{orders.length === 0 ? <div className="account-empty"><PackageCheck/><h3>No submitted orders yet.</h3><p>Your approved business can begin building a wholesale case order now.</p><Link href="/shop" className="text-link">Browse catalog <ArrowRight/></Link></div> : <div className="buyer-order-list">{orders.map((order) => <div key={order.id}><div><b>{order.orderNumber}</b><small>{new Date(order.submitted).toLocaleString()}</small></div><span>{order.itemCount} cases · {order.method}</span><strong>{order.status}</strong></div>)}</div>}</article>
    </section>
  </main>;
}

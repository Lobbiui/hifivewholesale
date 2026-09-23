"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CheckCircle2, LogOut, MapPin, PackageCheck, ShieldCheck, Trash2 } from "lucide-react";

type BuyerIdentity = { applicationId: string | null; company: string; displayName: string; email: string };
type BuyerOrder = { id:string;orderNumber:string;status:string;method:string;estimatedTotal:number|null;pricingPending:boolean;submitted:string;itemCount:number };
type Address={id:string;label:string;recipient:string;line1:string;line2:string;city:string;region:string;postal_code:string;country_code:string;phone:string;is_default:boolean};

export default function BuyerAccountPage() {
  const router = useRouter();
  const [buyer, setBuyer] = useState<BuyerIdentity | null>(null);
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [addresses,setAddresses]=useState<Address[]>([]);const [loyalty,setLoyalty]=useState({points_balance:0,tier:"MEMBER"});const [message,setMessage]=useState("");

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
      const accountResponse=await fetch("/api/buyer/account",{cache:"no-store"});if(active&&accountResponse.ok){const result=await accountResponse.json() as {addresses:Address[];loyalty:{points_balance:number;tier:string}};setAddresses(result.addresses);setLoyalty(result.loyalty)}
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const signOut = async () => {
    await fetch("/api/buyer/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("hifive-buyer-session-change"));
    router.replace("/");
    router.refresh();
  };
  const addAddress=async(form:FormData)=>{const payload={label:form.get("label"),recipient:form.get("recipient"),line1:form.get("line1"),line2:form.get("line2"),city:form.get("city"),region:form.get("region"),postalCode:form.get("postalCode"),countryCode:form.get("countryCode"),phone:form.get("phone"),isDefault:form.get("isDefault")==="on"};const response=await fetch("/api/buyer/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!response.ok){setMessage("Address could not be saved.");return}window.location.reload()};
  const removeAddress=async(id:string)=>{const response=await fetch(`/api/buyer/account?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(response.ok)setAddresses(current=>current.filter(item=>item.id!==id))};

  return <main className="page-shell light-page account-page"><section className="account-hero container"><div><span className="eyebrow">Buyer account</span><h1>YOUR WHOLESALE<br/>COMMAND CENTER.</h1><p>Review business approval and submitted case orders from one private workspace.</p></div><div className="approval-card"><CheckCircle2/><small>Account status</small><strong>Approved business</strong><span>Catalog and ordering access enabled</span></div></section>
    <section className="account-grid container"><article className="account-business"><span className="eyebrow">Verified business</span><Building2/><h2>{buyer?.company || "Loading account…"}</h2><dl><div><dt>Buyer</dt><dd>{buyer?.displayName}</dd></div><div><dt>Business email</dt><dd>{buyer?.email}</dd></div><div><dt>Approval ID</dt><dd>{buyer?.applicationId}</dd></div><div><dt>Loyalty</dt><dd>{loyalty.points_balance} points · {loyalty.tier}</dd></div></dl><div className="account-actions"><Link className="button primary" href="/shop">Shop catalog <ArrowRight/></Link><button className="button dark" onClick={signOut}><LogOut/>Sign out</button></div></article>
      <article className="account-orders"><div className="account-section-head"><div><span className="eyebrow">Order activity</span><h2>RECENT ORDERS.</h2></div><ShieldCheck/></div>{orders.length === 0 ? <div className="account-empty"><PackageCheck/><h3>No submitted orders yet.</h3><p>Your approved business can begin building a wholesale case order now.</p><Link href="/shop" className="text-link">Browse catalog <ArrowRight/></Link></div> : <div className="buyer-order-list">{orders.map((order) => <div key={order.id}><div><b>{order.orderNumber}</b><small>{new Date(order.submitted).toLocaleString()}</small></div><span>{order.itemCount} cases · {order.method}</span><strong>{order.status}</strong></div>)}</div>}</article>
    </section><section className="section container"><div className="account-section-head"><div><span className="eyebrow">Fulfillment profile</span><h2>BUSINESS ADDRESSES.</h2></div><MapPin/></div>{message&&<div className="gate-message">{message}</div>}<div className="customer-grid">{addresses.map(item=><article className="admin-card" key={item.id}><h3>{item.label}{item.is_default?" · Default":""}</h3><p>{item.recipient}<br/>{item.line1}{item.line2?<><br/>{item.line2}</>:null}<br/>{item.city}, {item.region} {item.postal_code}<br/>{item.country_code}</p><button className="link-button" onClick={()=>void removeAddress(item.id)}><Trash2/>Remove</button></article>)}</div><form className="admin-card operations-form" action={addAddress}><label>Label<input name="label" placeholder="Warehouse" required/></label><label>Recipient<input name="recipient" required/></label><label>Address<input name="line1" required/></label><label>Address line 2<input name="line2"/></label><label>City<input name="city" required/></label><label>State / region<input name="region" required/></label><label>Postal code<input name="postalCode" required/></label><label>Country code<input name="countryCode" defaultValue="US" maxLength={2} required/></label><label>Phone<input name="phone" type="tel"/></label><label><input name="isDefault" type="checkbox"/> Make default</label><button className="button primary">Save address</button></form></section>
  </main>;
}

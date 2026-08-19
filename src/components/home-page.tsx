"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, BadgeCheck, Boxes, Headphones, MapPin, PackageCheck, Sparkles, Truck } from "lucide-react";
import { CinematicIntro } from "./cinematic-intro";
import { ProductCard } from "./product-card";
import { products, posts } from "@/lib/data";
import { useLanguage } from "./language-provider";

export function HomePage() {
  const { copy } = useLanguage();
  return <main>
    <CinematicIntro />
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-content container"><span className="eyebrow light">{copy.kicker}</span><h1>{copy.hero}</h1><p>{copy.heroCopy}</p><div className="hero-actions"><Link href="/shop" className="button primary">{copy.explore}<ArrowRight /></Link><a href="#wholesale" className="button glass">{copy.wholesale}</a></div></div>
      <div className="hero-rail"><span>Fast-moving inventory</span><span>Pickup + delivery</span><span>Retailer-first support</span></div><a className="scroll-cue" href="#proof">Scroll <ArrowDownRight /></a>
    </section>
    <section id="proof" className="proof-strip"><div><strong>2,400+</strong><span>active SKUs</span></div><div><strong>48 hr</strong><span>average turnaround</span></div><div><strong>3 ways</strong><span>pickup, local delivery, freight</span></div><div><strong>Real people</strong><span>on the wholesale desk</span></div></section>
    <section className="section container"><div className="section-heading"><div><span className="eyebrow">The fast-moving edit</span><h2>STOCK WHAT<br/><em>THEY ASK FOR.</em></h2></div><p>Curated high-velocity products, transparent case pricing, and a catalog designed to get you from browse to reorder without the busywork.</p></div><div className="product-grid">{products.slice(0,4).map((product) => <ProductCard key={product.id} product={product}/>)}</div><Link className="text-link" href="/shop">View the full wholesale catalog <ArrowRight /></Link></section>
    <section className="split-story"><div className="story-image"><div className="story-stamp"><Sparkles/><span>Built for<br/>independent<br/>retail</span></div></div><div className="story-copy"><span className="eyebrow light">Why Hi-Five</span><h2>THE SUPPLY PARTNER THAT KEEPS UP.</h2><p>Good wholesale should feel clear, quick, and human. We pair a sharp assortment with responsive support so you can spend less time chasing inventory and more time serving customers.</p><ul><li><BadgeCheck/>Vetted, shelf-ready assortment</li><li><Boxes/>Flexible case and volume tiers</li><li><Headphones/>A wholesale desk that answers</li></ul><Link href="/contact" className="button white">Meet your supply team <ArrowRight/></Link></div></section>
    <section className="section container"><div className="section-heading compact"><div><span className="eyebrow">From shelf to doorstep</span><h2>FULFILLMENT<br/><em>WITHOUT FRICTION.</em></h2></div></div><div className="service-grid"><article><span>01</span><PackageCheck/><h3>Warehouse pickup</h3><p>Reserve online and collect on your schedule with case counts ready when you arrive.</p></article><article><span>02</span><Truck/><h3>Local delivery</h3><p>Route-aware delivery windows and clear status updates from packed to received.</p></article><article><span>03</span><MapPin/><h3>Freight ready</h3><p>Consolidated wholesale shipping for qualified territories and larger replenishment orders.</p></article></div></section>
    <section id="wholesale" className="wholesale-cta"><div><span className="eyebrow light">Retailers & distributors</span><h2>LET’S MOVE<br/>MORE, TOGETHER.</h2></div><div><p>Tell us where you sell and what you need. Our wholesale team will map the right assortment, pricing tier, and fulfillment plan.</p><Link href="/contact" className="button primary">Start an application <ArrowRight/></Link><small>Resale documentation required · responses within one business day</small></div></section>
    <section className="social-section"><div className="container"><div className="section-heading"><div><span className="eyebrow light">From the feed</span><h2>WHAT’S<br/><em>HAPPENING NOW.</em></h2></div><p>Launches, warehouse moments, retailer wins, and the products moving through Hi-Five this week—managed directly by the content team.</p></div><div className="social-feed"><article className="social-hero"><span>@hifivesupply · 2h</span><h3>PURPLE RUSH<br/>JUST LANDED.</h3><small>New arrival · Wholesale cases now available</small></article><article><span>Warehouse note</span><div className="social-orb">HF</div><h3>Orders packed with momentum.</h3></article><article><span>Retailer spotlight</span><b>“The fastest reorder we’ve placed all quarter.”</b><small>— Midtown Market</small></article></div></div></section>
    <section className="section container"><div className="section-heading"><div><span className="eyebrow">Hi-Five Journal</span><h2>SMARTER<br/><em>SELL-THROUGH.</em></h2></div><Link href="/blog" className="text-link">Read all stories <ArrowRight/></Link></div><div className="journal-grid">{posts.map((post, index) => <Link href="/blog" key={post.slug} className={`journal-card card-${index+1}`}><span>{post.tag}</span><h3>{post.title}</h3><p>{post.excerpt}</p><ArrowRight/></Link>)}</div></section>
  </main>;
}

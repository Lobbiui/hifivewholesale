import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { posts } from "@/lib/data";
export default function BlogPage(){ return <main className="page-shell"><header className="page-hero journal-hero"><span className="eyebrow light">The Hi-Five Journal</span><h1>SELL SMARTER.<br/>STAY CURIOUS.</h1><p>Retail strategy, product intelligence, and practical ideas for better wholesale operations.</p></header><section className="section container"><div className="journal-grid large">{[...posts,...posts].map((post,index)=><Link href="/contact" className={`journal-card card-${index%3+1}`} key={`${post.slug}-${index}`}><span>{post.tag}</span><h3>{post.title}</h3><p>{post.excerpt}</p><small>5 min read</small><ArrowRight/></Link>)}</div></section></main> }


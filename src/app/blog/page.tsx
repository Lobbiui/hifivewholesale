import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { posts as fallback } from "@/lib/data";
import { getDatabase } from "@/lib/server/database";
export const dynamic="force-dynamic";
type Post={slug:string;tag:string;title:string;excerpt:string};
export default async function BlogPage(){let posts:Post[]=[];try{const database=await getDatabase();const result=await database.query<Post>("SELECT slug,tag,title,excerpt FROM blog_posts WHERE status='PUBLISHED' AND (publish_at IS NULL OR publish_at<=CURRENT_TIMESTAMP) ORDER BY publish_at DESC,created_at DESC");posts=result.rows}catch{}if(!posts.length)posts=fallback;return <main className="page-shell"><header className="page-hero journal-hero"><span className="eyebrow light">The Hi-Five Journal</span><h1>SELL SMARTER.<br/>STAY CURIOUS.</h1><p>Retail strategy, product intelligence, and practical ideas for better wholesale operations.</p></header><section className="section container"><div className="journal-grid large">{posts.map((post,index)=><Link href={`/blog/${post.slug}`} className={`journal-card card-${index%3+1}`} key={post.slug}><span>{post.tag}</span><h3>{post.title}</h3><p>{post.excerpt}</p><small>5 min read</small><ArrowRight/></Link>)}</div></section></main>}

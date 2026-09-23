import { notFound } from "next/navigation";
import { posts as fallback } from "@/lib/data";
import { getDatabase } from "@/lib/server/database";
export const dynamic="force-dynamic";
type Post={title:string;tag:string;body:string;publish_at:string|Date|null};
export default async function BlogArticle({params}:PageProps<"/blog/[slug]">){const {slug}=await params;let post:Post|undefined;try{const database=await getDatabase();post=(await database.query<Post>("SELECT title,tag,body,publish_at FROM blog_posts WHERE slug=$1 AND status='PUBLISHED' AND (publish_at IS NULL OR publish_at<=CURRENT_TIMESTAMP) LIMIT 1",[slug])).rows[0]}catch{}if(!post){const item=fallback.find(candidate=>candidate.slug===slug);if(item)post={title:item.title,tag:item.tag,body:item.excerpt,publish_at:null}}if(!post)notFound();return <main className="legal-page container"><span className="eyebrow">{post.tag}</span><h1>{post.title}</h1><p className="legal-updated">{post.publish_at?new Date(post.publish_at).toLocaleDateString():"Hi-Five Journal"}</p><section>{post.body.split(/\n{2,}/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section></main>}

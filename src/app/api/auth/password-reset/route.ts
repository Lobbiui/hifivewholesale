import { createHash,randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";
import { publicSiteOrigin } from "@/lib/server/public-origin";
export const runtime="nodejs";
const schema=z.object({email:z.string().trim().email()});
export async function POST(request:Request){if(!hasValidRequestOrigin(request))return NextResponse.json({ok:false},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({ok:false,message:"Enter a valid email address."},{status:422});const database=await getDatabase(),found=await database.query<{id:string;email:string;system_role:string}>("SELECT id,email,system_role FROM users WHERE LOWER(email)=LOWER($1) AND status IN ('ACTIVE','INVITED') LIMIT 1",[parsed.data.email]);const user=found.rows[0];if(user){const token=randomBytes(32).toString("base64url"),hash=createHash("sha256").update(token).digest("hex");await database.query("UPDATE user_credentials SET reset_token_hash=$2,reset_token_expires_at=CURRENT_TIMESTAMP+INTERVAL '24 hours' WHERE user_id=$1",[user.id,hash]);const origin=publicSiteOrigin(request),path=user.system_role==="BUYER"?"/activate":"/admin/activate",url=`${origin}${path}?token=${encodeURIComponent(token)}`;await queueAndSendEmail(database,{templateKey:"password_reset",to:user.email,subject:"Reset your HiFive password",text:`Reset your HiFive password within 24 hours: ${url}`})}return NextResponse.json({ok:true,message:"If that account exists, password reset instructions have been queued for delivery."})}

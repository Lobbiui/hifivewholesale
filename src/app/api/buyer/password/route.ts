import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { hashPassword,verifyPassword } from "@/lib/server/passwords";
export const runtime="nodejs";export const dynamic="force-dynamic";
const schema=z.object({currentPassword:z.string().min(8).max(200),newPassword:z.string().min(12).max(200).regex(/[A-Za-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)}).strict();
export async function POST(request:Request){if(!hasValidRequestOrigin(request))return NextResponse.json({ok:false},{status:403});const buyer=await getBuyerIdentity();if(!buyer)return NextResponse.json({ok:false},{status:401});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({ok:false,message:"Use at least 12 characters with a letter, number, and special character."},{status:422});const db=await getDatabase(),found=await db.query<{password_hash:string}>("SELECT password_hash FROM user_credentials WHERE user_id=$1",[buyer.id]);if(!found.rows[0]||!await verifyPassword(parsed.data.currentPassword,found.rows[0].password_hash))return NextResponse.json({ok:false,message:"The temporary password is incorrect."},{status:401});const hash=await hashPassword(parsed.data.newPassword);await db.transaction(async tx=>{await tx.query("UPDATE user_credentials SET password_hash=$2,password_updated_at=CURRENT_TIMESTAMP,failed_attempts=0,locked_until=NULL WHERE user_id=$1",[buyer.id,hash]);await tx.query("UPDATE users SET must_change_password=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[buyer.id])});return NextResponse.json({ok:true})}

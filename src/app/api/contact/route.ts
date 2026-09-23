import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";
export const runtime="nodejs";
const schema=z.object({firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),email:z.string().trim().email(),phone:z.string().trim().max(40).default(""),company:z.string().trim().min(2).max(200),interest:z.string().trim().min(2).max(150),message:z.string().trim().max(4000).default("")});
export async function POST(request:Request){if(!hasValidRequestOrigin(request))return NextResponse.json({ok:false},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({ok:false,message:"Complete the required contact fields."},{status:422});const data=parsed.data,database=await getDatabase();await database.transaction(async tx=>{await tx.query("INSERT INTO contact_submissions (id,first_name,last_name,business_email,phone,company,interest,message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),data.firstName,data.lastName,data.email.toLowerCase(),data.phone,data.company,data.interest,data.message]);await queueAndSendEmail(tx,{templateKey:"contact_submission",to:process.env.CONTACT_ADMIN_EMAIL?.trim()||process.env.CHAT_ADMIN_EMAIL?.trim()||"wholesale@hifivesupply.com",subject:`Wholesale contact: ${data.company}`,text:`${data.firstName} ${data.lastName} (${data.email})\nInterest: ${data.interest}\nPhone: ${data.phone}\n\n${data.message}`})});return NextResponse.json({ok:true},{status:201})}

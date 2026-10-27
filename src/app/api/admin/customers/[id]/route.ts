import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";
import { hashPassword } from "@/lib/server/passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profile = z.object({
  action: z.literal("profile"),
  companyName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320).transform(v=>v.toLowerCase()),
  phone: z.string().trim().max(40),
  businessType: z.string().trim().max(100),
  resaleId: z.string().trim().max(100),
  resaleAuthorization: z.string().trim().max(500),
  resaleDocumentStatus: z.enum(["NOT_PROVIDED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"]),
  resaleDocumentNotes: z.string().trim().max(2000),
  territory: z.string().trim().max(100),
  websiteUrl: z.string().trim().url().max(500).or(z.literal("")),
  licenseNumber: z.string().trim().max(150),
  licenseExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  accountManagerName: z.string().trim().max(160),
  accountManagerPhone: z.string().trim().max(40),
  internalNotes: z.string().trim().max(10000),
}).strict();
const location = z.object({action:z.literal("location"),name:z.string().trim().min(2).max(160),locationType:z.enum(["RETAIL","WAREHOUSE","OFFICE"]),line1:z.string().trim().min(2).max(200),line2:z.string().trim().max(200),city:z.string().trim().min(2).max(100),region:z.string().trim().min(2).max(100),postalCode:z.string().trim().min(2).max(30),phone:z.string().trim().max(40),isPrimary:z.boolean()}).strict();
const contact = z.object({action:z.literal("contact_log"),channel:z.enum(["PHONE","EMAIL","TEXT","WHATSAPP","FACEBOOK","IN_PERSON","OTHER"]),subject:z.string().trim().min(2).max(200),notes:z.string().trim().min(2).max(5000),contactedAt:z.string().datetime().optional()}).strict();
const password = z.object({action:z.literal("temporary_password"),password:z.string().min(12).max(200).regex(/[A-Za-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)}).strict();
const mutation=z.discriminatedUnion("action",[profile,location,contact,password]);

async function ensureAccount(id:string){const db=await getDatabase();const found=await db.query("SELECT id FROM organizations WHERE id=$1 AND organization_type='WHOLESALE_BUYER'",[id]);return Boolean(found.rows[0])}

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  if(!await getAdminIdentity())return NextResponse.json({ok:false},{status:401});
  const {id}=await context.params,db=await getDatabase();
  const [account,documents,locations,contacts,orders]=await Promise.all([
    db.query(`SELECT o.*,u.id AS user_id,u.email,u.display_name AS contact_name,u.status AS user_status,u.must_change_password,
      reviewer.display_name AS resale_document_reviewed_by_name,
      COALESCE(l.points_balance,0)::int AS points,COALESCE(l.tier,'MEMBER') AS loyalty_tier
      FROM organizations o LEFT JOIN LATERAL (SELECT u.* FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.system_role='BUYER' WHERE m.organization_id=o.id ORDER BY CASE WHEN m.membership_role='OWNER' THEN 0 ELSE 1 END,m.created_at LIMIT 1) u ON TRUE
      LEFT JOIN users reviewer ON reviewer.id=o.resale_document_reviewed_by
      LEFT JOIN loyalty_accounts l ON l.organization_id=o.id WHERE o.id=$1 AND o.organization_type='WHOLESALE_BUYER'`,[id]),
    db.query("SELECT id,folder,display_name,filename,mime_type,size_bytes,created_at FROM customer_documents WHERE organization_id=$1 ORDER BY folder,created_at DESC",[id]),
    db.query("SELECT id,name,location_type,line1,line2,city,region,postal_code,phone,is_primary,created_at FROM customer_locations WHERE organization_id=$1 ORDER BY is_primary DESC,name",[id]),
    db.query(`SELECT c.id,c.channel,c.subject,c.notes,c.contacted_at,c.created_at,u.display_name AS created_by FROM customer_contact_logs c JOIN users u ON u.id=c.created_by WHERE c.organization_id=$1 ORDER BY c.contacted_at DESC`,[id]),
    db.query(`SELECT r.id,r.order_number,r.state,r.fulfillment_method,r.purchase_order_number,r.estimated_total_cents,r.pricing_pending,r.submitted_at,
      r.submitted_at + INTERVAL '30 days' AS invoice_expires_at,
      CURRENT_TIMESTAMP < r.submitted_at + INTERVAL '30 days' AS invoice_available,
      r.payment_status,r.amount_paid_cents,r.amount_refunded_cents,r.payment_provider_reference,
      COALESCE(jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'cases',i.quantity_cases,'casePriceCents',i.case_price_cents) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
      FROM order_requests r LEFT JOIN order_request_items i ON i.order_request_id=r.id WHERE r.organization_id=$1 GROUP BY r.id ORDER BY r.submitted_at DESC`,[id]),
  ]);
  if(!account.rows[0])return NextResponse.json({ok:false,message:"Wholesale account not found."},{status:404});
  return NextResponse.json({ok:true,account:account.rows[0],documents:documents.rows,locations:locations.rows,contacts:contacts.rows,orders:orders.rows});
}

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  if(!hasValidRequestOrigin(request))return NextResponse.json({ok:false},{status:403});
  const admin=await getAdminIdentity();if(!admin)return NextResponse.json({ok:false},{status:401});
  const parsed=mutation.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({ok:false,message:"Review the account fields and try again."},{status:422});
  const {id}=await context.params;if(!await ensureAccount(id))return NextResponse.json({ok:false,message:"Wholesale account not found."},{status:404});
  const db=await getDatabase(),data=parsed.data;
  try{const result=await db.transaction(async tx=>{
    let auditData:Record<string,unknown>=data;
    if(data.action==="profile"){
      const existing=await tx.query<{resale_id:string|null;resale_document_status:string}>("SELECT resale_id,resale_document_status FROM organizations WHERE id=$1 FOR UPDATE",[id]);
      const prior=existing.rows[0];
      const normalizedResaleId=data.resaleId.trim();
      let resaleDocumentStatus=normalizedResaleId?data.resaleDocumentStatus:"NOT_PROVIDED";
      if(normalizedResaleId&&resaleDocumentStatus==="NOT_PROVIDED")resaleDocumentStatus="PENDING";
      if(prior?.resale_document_status==="VERIFIED"&&(prior.resale_id??"")!==normalizedResaleId)resaleDocumentStatus="PENDING";
      const reviewComplete=["VERIFIED","REJECTED","EXPIRED"].includes(resaleDocumentStatus);
      auditData={...data,resaleId:normalizedResaleId,resaleDocumentStatus};
      await tx.query(`UPDATE organizations SET legal_name=$2,display_name=$2,business_phone=NULLIF($3,''),business_type=NULLIF($4,''),resale_id=NULLIF($5,''),resale_authorization=NULLIF($6,''),resale_document_status=$7,resale_document_notes=$8,resale_document_reviewed_at=CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE NULL END,resale_document_reviewed_by=CASE WHEN $9 THEN $10 ELSE NULL END,primary_territory=NULLIF($11,''),website_url=NULLIF($12,''),license_number=NULLIF($13,''),license_expires_at=$14::date,account_manager_name=NULLIF($15,''),account_manager_phone=NULLIF($16,''),internal_notes=$17,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id,data.companyName,data.phone,data.businessType,normalizedResaleId,data.resaleAuthorization,resaleDocumentStatus,data.resaleDocumentNotes,reviewComplete,admin.id,data.territory,data.websiteUrl,data.licenseNumber,data.licenseExpiresAt||null,data.accountManagerName,data.accountManagerPhone,data.internalNotes]);
      const owner=await tx.query<{id:string}>("SELECT u.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.system_role='BUYER' WHERE m.organization_id=$1 ORDER BY CASE WHEN m.membership_role='OWNER' THEN 0 ELSE 1 END LIMIT 1",[id]);
      if(owner.rows[0])await tx.query("UPDATE users SET email=$2,display_name=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[owner.rows[0].id,data.email,data.contactName]);
    }else if(data.action==="location"){
      if(data.isPrimary)await tx.query("UPDATE customer_locations SET is_primary=FALSE WHERE organization_id=$1",[id]);
      await tx.query("INSERT INTO customer_locations (id,organization_id,name,location_type,line1,line2,city,region,postal_code,phone,is_primary) VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8,$9,NULLIF($10,''),$11)",[randomUUID(),id,data.name,data.locationType,data.line1,data.line2,data.city,data.region,data.postalCode,data.phone,data.isPrimary]);
    }else if(data.action==="contact_log"){
      await tx.query("INSERT INTO customer_contact_logs (id,organization_id,channel,subject,notes,contacted_at,created_by) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,CURRENT_TIMESTAMP),$7)",[randomUUID(),id,data.channel,data.subject,data.notes,data.contactedAt??null,admin.id]);
    }else{
      const owner=await tx.query<{id:string}>("SELECT u.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.system_role='BUYER' WHERE m.organization_id=$1 ORDER BY CASE WHEN m.membership_role='OWNER' THEN 0 ELSE 1 END LIMIT 1",[id]);
      if(!owner.rows[0])throw new Error("This account does not have a buyer login.");
      const hash=await hashPassword(data.password);
      await tx.query("UPDATE users SET status='ACTIVE',must_change_password=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[owner.rows[0].id]);
      await tx.query("UPDATE user_credentials SET password_hash=$2,password_updated_at=CURRENT_TIMESTAMP,reset_token_hash=NULL,reset_token_expires_at=NULL,failed_attempts=0,locked_until=NULL WHERE user_id=$1",[owner.rows[0].id,hash]);
      await tx.query("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL",[owner.rows[0].id]);
    }
    await tx.query("INSERT INTO audit_events (id,actor_user_id,organization_id,action,aggregate_type,aggregate_id,after_json) VALUES ($1,$2,$3,$4,'WHOLESALE_ACCOUNT',$3,$5)",[randomUUID(),admin.id,id,`CUSTOMER_${data.action.toUpperCase()}`,auditData]);
    return data.action;
  });return NextResponse.json({ok:true,action:result});}catch(error){const message=error instanceof Error&&/buyer login/i.test(error.message)?error.message:/unique|duplicate/i.test(String(error))?"That email is already assigned to another account.":"The account change could not be saved.";return NextResponse.json({ok:false,message},{status:422})}
}

export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
  if(!hasValidRequestOrigin(request))return NextResponse.json({ok:false},{status:403});if(!await getAdminIdentity())return NextResponse.json({ok:false},{status:401});
  const {id}=await context.params,type=new URL(request.url).searchParams.get("type"),recordId=new URL(request.url).searchParams.get("recordId");if(!recordId||!['location','contact'].includes(type??''))return NextResponse.json({ok:false},{status:422});
  const db=await getDatabase();await db.query(type==='location'?"DELETE FROM customer_locations WHERE id=$1 AND organization_id=$2":"DELETE FROM customer_contact_logs WHERE id=$1 AND organization_id=$2",[recordId,id]);return NextResponse.json({ok:true});
}

export function generateTemporaryPassword(){return `HiFive!${randomBytes(8).toString('hex').toUpperCase()}`}

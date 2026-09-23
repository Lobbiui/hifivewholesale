import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getDatabase } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("order_status"), id: z.string().min(1), state: z.enum(["SUBMITTED_FOR_REVIEW","PRICING_REVIEW","READY_FOR_CHECKOUT","CONVERTED","DECLINED"]) }),
  z.object({ action: z.literal("order_note"), id: z.string().min(1), note: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("customer_status"), id: z.string().min(1), status: z.enum(["APPROVED","SUSPENDED"]) }),
  z.object({ action: z.literal("brand_status"), id: z.string().min(1), status: z.enum(["NEW","REVIEW","SAMPLES_REQUESTED","APPROVED","DECLINED"]), notes: z.string().trim().max(4000).optional() }),
  z.object({ action: z.literal("loyalty_rules"), pointsPerDollar: z.number().min(0).max(100), multiplier: z.number().min(0).max(20), redemptionCents: z.number().min(0).max(100) }),
  z.object({ action: z.literal("promotion_create"), code: z.string().trim().min(2).max(40), description: z.string().trim().min(2).max(300), discountType: z.enum(["PERCENT","FIXED","FREE_FREIGHT","POINTS_MULTIPLIER"]), value: z.number().min(0), status: z.enum(["DRAFT","ACTIVE","SCHEDULED"]) }),
  z.object({ action: z.literal("blog_create"), title: z.string().trim().min(3).max(200), tag: z.string().trim().min(2).max(80), excerpt: z.string().trim().min(5).max(500), body: z.string().trim().min(20).max(30000), status: z.enum(["DRAFT","PUBLISHED"]) }),
  z.object({ action: z.literal("blog_status"), id: z.string().min(1), status: z.enum(["DRAFT","PUBLISHED","ARCHIVED"]) }),
  z.object({ action: z.literal("distributor_create"), company: z.string().trim().min(2).max(200), contact: z.string().trim().max(160), email: z.string().trim().email().or(z.literal("")), notes: z.string().trim().max(4000) }),
  z.object({ action: z.literal("distributor_stage"), id: z.string().min(1), stage: z.enum(["APPLICATION","QUALIFIED","NEGOTIATION","APPROVED","DECLINED"]) }),
  z.object({ action: z.literal("tier_create"), name: z.string().trim().min(2).max(100), minimumCases: z.number().int().min(1).max(100000), discountPercent: z.number().min(0).max(100) }),
  z.object({ action: z.literal("market_update"), countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()), marketName: z.string().trim().min(2).max(100), currency: z.string().trim().length(3).transform((value) => value.toUpperCase()), status: z.enum(["ACTIVE","REVIEW","DISABLED"]), pickupEnabled: z.boolean(), deliveryEnabled: z.boolean(), shippingNotes: z.string().trim().max(2000) }),
]);

export async function GET() {
  if (!await getAdminIdentity()) return NextResponse.json({ ok: false }, { status: 401 });
  const database = await getDatabase();
  const [orders, customers, brands, loyalty, promotions, blogs, distributors, tiers, markets, emails, contacts] = await Promise.all([
    database.query(`SELECT r.id, r.order_number, r.state, r.fulfillment_method, r.contact_email, r.purchase_order_number, r.estimated_total_cents, r.pricing_pending, r.submitted_at, o.display_name AS customer, COALESCE(SUM(i.quantity_cases),0)::int AS cases, (SELECT note FROM order_request_notes n WHERE n.order_request_id=r.id ORDER BY n.created_at DESC LIMIT 1) AS latest_note FROM order_requests r JOIN organizations o ON o.id=r.organization_id LEFT JOIN order_request_items i ON i.order_request_id=r.id GROUP BY r.id,o.display_name ORDER BY r.submitted_at DESC LIMIT 200`),
    database.query(`SELECT o.id, o.display_name, o.status, o.resale_id, o.primary_territory, u.email, u.display_name AS contact, COUNT(DISTINCT r.id)::int AS orders, COALESCE(l.points_balance,0)::int AS points, COALESCE(l.tier,'MEMBER') AS tier FROM organizations o LEFT JOIN organization_memberships m ON m.organization_id=o.id LEFT JOIN users u ON u.id=m.user_id AND u.system_role='BUYER' LEFT JOIN order_requests r ON r.organization_id=o.id LEFT JOIN loyalty_accounts l ON l.organization_id=o.id WHERE o.organization_type='WHOLESALE_BUYER' GROUP BY o.id,u.email,u.display_name,l.points_balance,l.tier ORDER BY o.created_at DESC`),
    database.query(`SELECT id, brand_name AS brand, contact_name AS contact, email, website_url AS website, categories, markets, monthly_volume AS volume, message, status, notes, submitted_at FROM brand_applications ORDER BY submitted_at DESC`),
    database.query(`SELECT points_per_dollar, redemption_cents_per_point, promotional_multiplier, tiers_json FROM loyalty_rules WHERE id='default'`),
    database.query(`SELECT id, code, description, discount_type, discount_value, status, starts_at, ends_at FROM promotions ORDER BY created_at DESC`),
    database.query(`SELECT id, slug, title, tag, excerpt, body, status, publish_at, created_at FROM blog_posts ORDER BY created_at DESC`),
    database.query(`SELECT id, company, contact_name, email, stage, notes, follow_up_at, created_at FROM distributor_leads ORDER BY created_at DESC`),
    database.query(`SELECT id, name, minimum_cases, discount_percent, active FROM wholesale_price_tiers ORDER BY minimum_cases`),
    database.query(`SELECT country_code, market_name, currency, status, pickup_enabled, delivery_enabled, shipping_notes FROM market_settings ORDER BY market_name`),
    database.query(`SELECT id, template_key, recipient, subject, status, last_error, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 50`),
    database.query(`SELECT id,first_name,last_name,business_email,phone,company,interest,message,status,submitted_at FROM contact_submissions ORDER BY submitted_at DESC LIMIT 100`),
  ]);
  return NextResponse.json({ ok: true, orders: orders.rows, customers: customers.rows, brands: brands.rows, loyalty: loyalty.rows[0] ?? null, promotions: promotions.rows, blogs: blogs.rows, distributors: distributors.rows, tiers: tiers.rows, markets: markets.rows, emails: emails.rows, contacts: contacts.rows });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = mutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "The requested operation is invalid." }, { status: 422 });
  const database = await getDatabase();
  const data = parsed.data;
  await database.transaction(async (transaction) => {
    if (data.action === "order_status") await transaction.query("UPDATE order_requests SET state=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1", [data.id, data.state]);
    else if (data.action === "order_note") await transaction.query("INSERT INTO order_request_notes (id,order_request_id,author_user_id,note) VALUES ($1,$2,$3,$4)", [randomUUID(), data.id, admin.id, data.note]);
    else if (data.action === "customer_status") await transaction.query("UPDATE organizations SET status=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_type='WHOLESALE_BUYER'", [data.id, data.status]);
    else if (data.action === "brand_status") await transaction.query("UPDATE brand_applications SET status=$2, notes=COALESCE($3,notes), updated_at=CURRENT_TIMESTAMP WHERE id=$1", [data.id, data.status, data.notes ?? null]);
    else if (data.action === "loyalty_rules") await transaction.query("UPDATE loyalty_rules SET points_per_dollar=$1,promotional_multiplier=$2,redemption_cents_per_point=$3,updated_by=$4,updated_at=CURRENT_TIMESTAMP WHERE id='default'", [data.pointsPerDollar,data.multiplier,data.redemptionCents,admin.id]);
    else if (data.action === "promotion_create") await transaction.query("INSERT INTO promotions (id,code,description,discount_type,discount_value,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(),data.code.toUpperCase(),data.description,data.discountType,data.value,data.status,admin.id]);
    else if (data.action === "blog_create") { const postSlug=`${slugify(data.title)}-${Date.now().toString().slice(-6)}`; await transaction.query("INSERT INTO blog_posts (id,slug,title,tag,excerpt,body,status,publish_at,author_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END,$8)", [randomUUID(),postSlug,data.title,data.tag,data.excerpt,data.body,data.status,admin.id]); }
    else if (data.action === "blog_status") await transaction.query("UPDATE blog_posts SET status=$2,publish_at=CASE WHEN $2='PUBLISHED' THEN COALESCE(publish_at,CURRENT_TIMESTAMP) ELSE publish_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [data.id,data.status]);
    else if (data.action === "distributor_create") await transaction.query("INSERT INTO distributor_leads (id,company,contact_name,email,notes) VALUES ($1,$2,$3,$4,$5)", [randomUUID(),data.company,data.contact,data.email,data.notes]);
    else if (data.action === "distributor_stage") await transaction.query("UPDATE distributor_leads SET stage=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [data.id,data.stage]);
    else if (data.action === "tier_create") await transaction.query("INSERT INTO wholesale_price_tiers (id,name,minimum_cases,discount_percent) VALUES ($1,$2,$3,$4)", [randomUUID(),data.name,data.minimumCases,data.discountPercent]);
    else if (data.action === "market_update") await transaction.query("INSERT INTO market_settings (country_code,market_name,currency,status,pickup_enabled,delivery_enabled,shipping_notes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (country_code) DO UPDATE SET market_name=EXCLUDED.market_name,currency=EXCLUDED.currency,status=EXCLUDED.status,pickup_enabled=EXCLUDED.pickup_enabled,delivery_enabled=EXCLUDED.delivery_enabled,shipping_notes=EXCLUDED.shipping_notes,updated_at=CURRENT_TIMESTAMP", [data.countryCode,data.marketName,data.currency,data.status,data.pickupEnabled,data.deliveryEnabled,data.shippingNotes]);
    await transaction.query("INSERT INTO audit_events (id,actor_user_id,action,aggregate_type,aggregate_id,after_json) VALUES ($1,$2,$3,'ADMIN_OPERATION',$4,$5)", [randomUUID(),admin.id,data.action,"id" in data ? data.id : randomUUID(),data]);
  });
  return NextResponse.json({ ok: true });
}

function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,120) || "post"; }

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminIdentity, hasValidRequestOrigin } from "@/lib/server/admin-auth";
import { getBuyerIdentity } from "@/lib/server/buyer-auth";
import { getDatabase } from "@/lib/server/database";
import { queueAndSendEmail } from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({ conversationId: z.string().max(100).optional(), company: z.string().trim().min(2).max(160).optional(), contact: z.string().trim().min(2).max(160).optional(), email: z.string().trim().toLowerCase().email().max(254).optional(), message: z.string().trim().min(1).max(2000) }).strict();
const updateSchema = z.object({ conversationId: z.string().min(1), action: z.enum(["read","close","open"]) }).strict();

export async function GET() {
  const admin = await getAdminIdentity();
  const buyer = admin ? null : await getBuyerIdentity();
  if (!admin && !buyer) return NextResponse.json({ ok: true, conversations: [] });
  const database = await getDatabase();
  const filter = admin ? "" : "WHERE c.buyer_user_id = $1";
  const params = admin ? [] : [buyer!.id];
  const conversations = await database.query<Record<string, unknown>>(
    `SELECT c.id,c.company,c.contact_name AS contact,c.contact_email AS email,c.status,c.unread_by_admin,c.unread_by_buyer,c.updated_at,
            COALESCE(json_agg(json_build_object('id',m.id,'sender',LOWER(m.sender_role),'body',m.body,'sentAt',m.created_at) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL),'[]') AS messages
       FROM chat_conversations c LEFT JOIN chat_messages m ON m.conversation_id=c.id ${filter}
      GROUP BY c.id ORDER BY c.updated_at DESC`, params);
  return NextResponse.json({ ok: true, conversations: conversations.rows });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Complete the message details." }, { status: 422 });
  const admin = await getAdminIdentity();
  const buyer = admin ? null : await getBuyerIdentity();
  const database = await getDatabase();
  const result = await database.transaction(async (transaction) => {
    let conversationId = parsed.data.conversationId;
    if (!conversationId) {
      if (!parsed.data.company || !parsed.data.contact || !parsed.data.email) throw new Error("Contact details are required.");
      conversationId = `chat_${randomUUID()}`;
      await transaction.query(`INSERT INTO chat_conversations (id,organization_id,buyer_user_id,company,contact_name,contact_email,unread_by_admin) VALUES ($1,$2,$3,$4,$5,$6,1)`, [conversationId,buyer?.organizationId ?? null,buyer?.id ?? null,parsed.data.company,parsed.data.contact,parsed.data.email]);
    } else {
      const allowed = await transaction.query<{ id: string }>(`SELECT id FROM chat_conversations WHERE id=$1 AND ($2::boolean=TRUE OR buyer_user_id=$3 OR ($3 IS NULL AND LOWER(contact_email)=LOWER($4)))`, [conversationId,Boolean(admin),buyer?.id ?? null,parsed.data.email ?? ""]);
      if (!allowed.rows[0]) throw new Error("Conversation not found.");
      await transaction.query(`UPDATE chat_conversations SET status='OPEN',updated_at=CURRENT_TIMESTAMP,unread_by_admin=unread_by_admin+$2,unread_by_buyer=unread_by_buyer+$3 WHERE id=$1`, [conversationId,admin ? 0 : 1,admin ? 1 : 0]);
    }
    await transaction.query(`INSERT INTO chat_messages (id,conversation_id,sender_user_id,sender_role,body) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(),conversationId,admin?.id ?? buyer?.id ?? null,admin ? "ADMIN" : "BUYER",parsed.data.message]);
    return conversationId;
  });
  if (!admin) {
    const notify = process.env.CHAT_ADMIN_EMAIL?.trim();
    if (notify) await queueAndSendEmail(database,{templateKey:"chat_message",to:notify,subject:`New wholesale chat from ${parsed.data.company || buyer?.company || "buyer"}`,text:`A new message was received:\n\n${parsed.data.message}\n\nOpen the Hi-Five admin Chat inbox to reply.`});
  }
  return NextResponse.json({ ok: true, conversationId: result }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 422 });
  const admin = await getAdminIdentity();
  const buyer = admin ? null : await getBuyerIdentity();
  if (!admin && !buyer) return NextResponse.json({ ok: false }, { status: 401 });
  const database = await getDatabase();
  if (parsed.data.action === "read") await database.query(`UPDATE chat_conversations SET ${admin ? "unread_by_admin" : "unread_by_buyer"}=0 WHERE id=$1`,[parsed.data.conversationId]);
  else if (admin) await database.query("UPDATE chat_conversations SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[parsed.data.conversationId,parsed.data.action.toUpperCase()]);
  else return NextResponse.json({ ok:false },{status:403});
  return NextResponse.json({ ok:true });
}

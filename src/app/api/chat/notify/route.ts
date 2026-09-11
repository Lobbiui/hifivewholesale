type ChatNotification = {
  conversationId?: string;
  company?: string;
  contact?: string;
  email?: string;
  message?: string;
};

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

export async function GET() {
  return Response.json({ configured: Boolean(process.env.RESEND_API_KEY && process.env.CHAT_ADMIN_EMAIL && process.env.CHAT_FROM_EMAIL) });
}

export async function POST(request: Request) {
  let body: ChatNotification;
  try {
    body = await request.json() as ChatNotification;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const conversationId = clean(body.conversationId, 40);
  const company = clean(body.company, 120);
  const contact = clean(body.contact, 120);
  const email = clean(body.email, 180);
  const message = clean(body.message, 2000);
  if (!conversationId || !company || !contact || !email || !message || !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "Company, contact, email, conversation, and message are required." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.CHAT_ADMIN_EMAIL;
  const fromEmail = process.env.CHAT_FROM_EMAIL;
  if (!apiKey || !adminEmail || !fromEmail) {
    return Response.json({ delivered: false, configurationRequired: true }, { status: 202 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${conversationId}-${Date.now()}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      reply_to: email,
      subject: `New wholesale chat from ${company}`,
      text: `New Hi-Five wholesale chat message\n\nConversation: ${conversationId}\nBusiness: ${company}\nContact: ${contact}\nEmail: ${email}\n\n${message}\n\nOpen the Hi-Five admin dashboard and select Chat inbox to reply.`,
      tags: [{ name: "channel", value: "wholesale_chat" }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend chat notification failed", response.status, detail.slice(0, 500));
    return Response.json({ delivered: false, error: "Email provider rejected the notification." }, { status: 502 });
  }

  const result = await response.json() as { id?: string };
  return Response.json({ delivered: true, id: result.id });
}

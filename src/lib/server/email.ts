import { randomUUID } from "node:crypto";
import type { Database } from "./database";

type EmailInput = { templateKey: string; to?: string; recipient?: string; subject: string; text: string };

export async function queueAndSendEmail(database: Database, input: EmailInput) {
  const id = `email_${randomUUID()}`;
  const recipient = input.to ?? input.recipient;
  if (!recipient) throw new Error("Email recipient is required.");
  await database.query(
    `INSERT INTO email_outbox (id, template_key, recipient, subject, text_body)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, input.templateKey, recipient, input.subject, input.text],
  );
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || process.env.CHAT_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    await database.query("UPDATE email_outbox SET status = 'SKIPPED', last_error = 'Email provider is not configured.' WHERE id = $1", [id]);
    return { id, delivered: false, configurationRequired: true };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify({ from, to: [recipient], subject: input.subject, text: input.text }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    const result = await response.json() as { id?: string };
    await database.query("UPDATE email_outbox SET status = 'SENT', provider_message_id = $2, sent_at = CURRENT_TIMESTAMP WHERE id = $1", [id, result.id ?? null]);
    return { id, delivered: true };
  } catch (error) {
    await database.query("UPDATE email_outbox SET status = 'FAILED', last_error = $2 WHERE id = $1", [id, error instanceof Error ? error.message.slice(0, 500) : "Unknown provider error"]);
    return { id, delivered: false };
  }
}

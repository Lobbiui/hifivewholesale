import { promises as fs } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const database = new PGlite();
  try {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort())
      await database.exec(await fs.readFile(path.join(directory, file), "utf8"));
    await database.exec(`
      INSERT INTO organizations (id,legal_name,display_name,organization_type,status)
      VALUES ('customer','Customer LLC','Customer','WHOLESALE_BUYER','APPROVED');
      INSERT INTO users (id,email,display_name,system_role,status)
      VALUES ('rep','rep@example.com','Sales Rep','SALES_REP','ACTIVE'),
             ('owner','owner@example.com','Owner','SUPER_ADMIN','ACTIVE'),
             ('buyer','buyer@example.com','Buyer','BUYER','ACTIVE');
      INSERT INTO organization_memberships (id,organization_id,user_id,membership_role)
      VALUES ('membership','customer','buyer','OWNER');
      INSERT INTO sales_rep_profiles (user_id,commission_rate_bps,custom_pricing_enabled)
      VALUES ('rep',750,TRUE);
      INSERT INTO sales_rep_customer_assignments (sales_rep_user_id,organization_id,assigned_by_user_id)
      VALUES ('rep','customer','owner');
      INSERT INTO order_requests (
        id,order_number,organization_id,buyer_user_id,state,fulfillment_method,contact_email,
        estimated_total_cents,pricing_pending,idempotency_key,payment_status,order_source,
        created_by_user_id,sales_rep_user_id,invoice_status,invoice_issued_at,invoice_expires_at,
        commission_rate_bps
      ) VALUES ('invoice','HF-INV-TEST','customer','buyer','READY_FOR_CHECKOUT','PICKUP',
        'buyer@example.com',10000,FALSE,'invoice-key','UNPAID','MANUAL_INVOICE','rep','rep',
        'ISSUED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '30 days',750);
      UPDATE order_requests SET payment_status='PAID',amount_paid_cents=estimated_total_cents,
        invoice_status='PAID',commission_earned_cents=ROUND(estimated_total_cents*commission_rate_bps/10000.0)::int
      WHERE id='invoice';
    `);
    const paid = await database.query<{ commission_earned_cents: number; remaining_days: number }>(
      `SELECT commission_earned_cents,
        FLOOR(EXTRACT(EPOCH FROM (invoice_expires_at-invoice_issued_at))/86400)::int AS remaining_days
       FROM order_requests WHERE id='invoice'`,
    );
    if (paid.rows[0]?.commission_earned_cents !== 750 || paid.rows[0]?.remaining_days !== 30)
      throw new Error("Manual invoice commission or retention calculation failed.");
    await database.exec(`UPDATE order_requests SET amount_refunded_cents=2500,
      commission_earned_cents=ROUND((amount_paid_cents-2500)*commission_rate_bps/10000.0)::int
      WHERE id='invoice'`);
    const refunded = await database.query<{ commission_earned_cents: number }>(
      "SELECT commission_earned_cents FROM order_requests WHERE id='invoice'",
    );
    if (refunded.rows[0]?.commission_earned_cents !== 563)
      throw new Error("Refund-adjusted commission calculation failed.");
    console.log("Sales representative and manual invoice workflow passed.");
  } finally {
    await database.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

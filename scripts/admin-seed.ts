import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { closeDatabase, getDatabase } from "../src/lib/server/database";
import { runMigrations } from "../src/lib/server/migrations";
import { hashPassword } from "../src/lib/server/passwords";

loadEnvConfig(process.cwd());

type SeedAdmin = { email: string; displayName: string; role: "ADMIN" | "SUPER_ADMIN"; password: string };

async function upsertAdmin(admin: SeedAdmin) {
  const database = await getDatabase();
  const existing = await database.query<{ id: string }>("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [admin.email]);
  const userId = existing.rows[0]?.id ?? `usr_${randomUUID()}`;
  const passwordHash = await hashPassword(admin.password);
  await database.transaction(async (transaction) => {
    if (existing.rows[0]) {
      await transaction.query(
        "UPDATE users SET display_name = $2, system_role = $3, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [userId, admin.displayName, admin.role],
      );
    } else {
      await transaction.query(
        "INSERT INTO users (id, email, display_name, system_role, status, email_verified_at) VALUES ($1, $2, $3, $4, 'ACTIVE', CURRENT_TIMESTAMP)",
        [userId, admin.email.toLowerCase(), admin.displayName, admin.role],
      );
    }
    await transaction.query(
      `INSERT INTO user_credentials (user_id, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         password_updated_at = CURRENT_TIMESTAMP, failed_attempts = 0, locked_until = NULL`,
      [userId, passwordHash],
    );
  });
}

async function seedPreviewApplications() {
  const database = await getDatabase();
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO buyer_applications (
         id, legal_business_name, contact_name, business_email, business_phone, resale_id,
         primary_territory, business_type, certification_accepted_at, status, submitted_at
       ) VALUES (
         'WA-1042', 'Broadway Market', 'Dana Lewis', 'buyer@broadway.example', '(555) 010-2044',
         'TN-884210', 'Tennessee', 'Retail store', CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP - INTERVAL '2 days'
       ) ON CONFLICT ((LOWER(business_email))) DO NOTHING`,
    );
    await transaction.query(
      `INSERT INTO organizations (id, legal_name, display_name, organization_type, status, resale_id, primary_territory)
       VALUES ('org_preview_lakeview', 'Lakeview Smoke', 'Lakeview Smoke', 'WHOLESALE_BUYER', 'APPROVED', 'IL-210084', 'Illinois')
       ON CONFLICT (id) DO NOTHING`,
    );
    await transaction.query(
      `INSERT INTO buyer_applications (
         id, legal_business_name, contact_name, business_email, business_phone, resale_id,
         primary_territory, business_type, certification_accepted_at, status, organization_id, submitted_at
       ) VALUES (
         'WA-1039', 'Lakeview Smoke', 'Omar Reed', 'orders@lakeview.example', '(555) 010-9912',
         'IL-210084', 'Illinois', 'Multi-location retailer', CURRENT_TIMESTAMP, 'APPROVED',
         'org_preview_lakeview', CURRENT_TIMESTAMP - INTERVAL '4 days'
       ) ON CONFLICT ((LOWER(business_email))) DO NOTHING`,
    );
  });
}

async function seedPreviewBuyer() {
  const database = await getDatabase();
  const passwordHash = await hashPassword("HiFiveBuyer!2026");
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO organizations (id, legal_name, display_name, organization_type, status, resale_id, primary_territory)
       VALUES ('org_preview_buyer', 'Hi-Five Preview Retailer', 'Hi-Five Preview Retailer', 'WHOLESALE_BUYER', 'APPROVED', 'DEMO-RESALE', 'Tennessee')
       ON CONFLICT (id) DO UPDATE SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP`,
    );
    await transaction.query(
      `INSERT INTO users (id, email, display_name, system_role, status, email_verified_at)
       VALUES ('usr_preview_buyer', 'buyer@hifivesupply.com', 'Preview Buyer', 'BUYER', 'ACTIVE', CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP`,
    );
    await transaction.query(
      `INSERT INTO user_credentials (user_id, password_hash)
       VALUES ('usr_preview_buyer', $1)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         reset_token_hash = NULL, reset_token_expires_at = NULL, failed_attempts = 0, locked_until = NULL`,
      [passwordHash],
    );
    await transaction.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, membership_role)
       VALUES ('membership_preview_buyer', 'org_preview_buyer', 'usr_preview_buyer', 'OWNER')
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
    );
    await transaction.query(
      `INSERT INTO buyer_applications (
         id, legal_business_name, contact_name, business_email, business_phone, resale_id,
         primary_territory, business_type, certification_accepted_at, status, organization_id
       ) VALUES (
         'WA-DEMO', 'Hi-Five Preview Retailer', 'Preview Buyer', 'buyer@hifivesupply.com',
         '(555) 010-0000', 'DEMO-RESALE', 'Tennessee', 'Retail store', CURRENT_TIMESTAMP,
         'APPROVED', 'org_preview_buyer'
       ) ON CONFLICT ((LOWER(business_email))) DO UPDATE SET organization_id = 'org_preview_buyer', status = 'APPROVED'`,
    );
  });
}

async function main() {
  const database = await getDatabase();
  await runMigrations(database);
  const preview = process.argv.includes("--preview");
  const admins: SeedAdmin[] = preview
    ? [
        { email: "jamie@hifivesupply.com", displayName: "Jamie Admin", role: "ADMIN", password: "HiFivePreview!2026" },
        { email: "alex@hifivesupply.com", displayName: "Alex Super Admin", role: "SUPER_ADMIN", password: "HiFivePreview!2026" },
      ]
    : [{
        email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
        displayName: process.env.BOOTSTRAP_ADMIN_NAME ?? "",
        role: process.env.BOOTSTRAP_ADMIN_ROLE === "ADMIN" ? "ADMIN" : "SUPER_ADMIN",
        password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "",
      }];

  for (const admin of admins) {
    if (!admin.email || !admin.displayName || admin.password.length < 12) {
      throw new Error("Admin email, name, and a password of at least 12 characters are required.");
    }
    await upsertAdmin(admin);
  }
  if (preview) {
    await seedPreviewApplications();
    await seedPreviewBuyer();
  }
  console.log(JSON.stringify({ ok: true, accounts: admins.map(({ email, role }) => ({ email, role })) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Admin setup failed.");
  process.exitCode = 1;
}).finally(closeDatabase);

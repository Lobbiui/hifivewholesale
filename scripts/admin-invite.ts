import { createHash, randomBytes, randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { closeDatabase, getDatabase } from "../src/lib/server/database";
import { runMigrations } from "../src/lib/server/migrations";
import { hashPassword } from "../src/lib/server/passwords";

loadEnvConfig(process.cwd());

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const email = argument("email")?.toLowerCase();
  const displayName = argument("name");
  const baseUrl = (argument("base-url") || "http://localhost:3010").replace(/\/$/, "");
  const role = argument("role") === "ADMIN" ? "ADMIN" : "SUPER_ADMIN";
  const resetActive = process.argv.includes("--reset-active");
  if (!email || !email.includes("@") || !displayName) {
    throw new Error("Use --email, --name, and optionally --role and --base-url.");
  }

  const database = await getDatabase();
  await runMigrations(database);
  const existing = await database.query<{ id: string; status: string }>(
    "SELECT id, status FROM users WHERE LOWER(email) = LOWER($1)",
    [email],
  );
  if (existing.rows[0]?.status === "ACTIVE" && !resetActive) {
    throw new Error("That administrator is already active. Use --reset-active to issue a replacement activation link.");
  }

  const userId = existing.rows[0]?.id ?? `usr_${randomUUID()}`;
  const token = randomBytes(32).toString("base64url");
  const placeholderHash = await hashPassword(randomBytes(32).toString("base64url"));
  await database.transaction(async (transaction) => {
    if (existing.rows[0]) {
      await transaction.query(
        "UPDATE users SET display_name = $2, system_role = $3, status = 'INVITED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [userId, displayName, role],
      );
    } else {
      await transaction.query(
        "INSERT INTO users (id, email, display_name, system_role, status) VALUES ($1, $2, $3, $4, 'INVITED')",
        [userId, email, displayName, role],
      );
    }
    await transaction.query(
      `INSERT INTO user_credentials (user_id, password_hash, reset_token_hash, reset_token_expires_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '24 hours')
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         reset_token_hash = EXCLUDED.reset_token_hash, reset_token_expires_at = EXCLUDED.reset_token_expires_at,
         failed_attempts = 0, locked_until = NULL`,
      [userId, placeholderHash, tokenHash(token)],
    );
    if (resetActive) {
      await transaction.query(
        "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
    }
  });

  console.log(`${baseUrl}/admin/activate?token=${encodeURIComponent(token)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Admin invitation failed.");
  process.exitCode = 1;
}).finally(closeDatabase);

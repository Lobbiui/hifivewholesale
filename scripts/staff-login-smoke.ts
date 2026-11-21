import { promises as fs } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { hashPassword, verifyPassword } from "../src/lib/server/passwords";

async function main() {
  const database = new PGlite();
  try {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort())
      await database.exec(await fs.readFile(path.join(directory, file), "utf8"));

    const temporaryPassword = "TemporaryRep1!";
    await database.query(
      `INSERT INTO users (id,email,display_name,system_role,status,must_change_password,email_verified_at)
       VALUES ('rep','rep@example.test','Outside Sales','SALES_REP','ACTIVE',TRUE,CURRENT_TIMESTAMP)`,
    );
    await database.query(
      "INSERT INTO user_credentials (user_id,password_hash) VALUES ('rep',$1)",
      [await hashPassword(temporaryPassword)],
    );
    const created = await database.query<{ password_hash: string; must_change_password: boolean }>(
      `SELECT c.password_hash,u.must_change_password FROM users u
       JOIN user_credentials c ON c.user_id=u.id WHERE u.id='rep'`,
    );
    if (!created.rows[0]?.must_change_password || !await verifyPassword(temporaryPassword, created.rows[0].password_hash))
      throw new Error("The owner-created temporary staff login was not stored correctly.");

    const permanentPassword = "PermanentRep2!";
    await database.query(
      "UPDATE user_credentials SET password_hash=$2,password_updated_at=CURRENT_TIMESTAMP WHERE user_id=$1",
      ["rep", await hashPassword(permanentPassword)],
    );
    await database.query(
      "UPDATE users SET must_change_password=FALSE WHERE id='rep'",
    );
    const secured = await database.query<{ password_hash: string; must_change_password: boolean }>(
      `SELECT c.password_hash,u.must_change_password FROM users u
       JOIN user_credentials c ON c.user_id=u.id WHERE u.id='rep'`,
    );
    if (secured.rows[0]?.must_change_password || !await verifyPassword(permanentPassword, secured.rows[0].password_hash))
      throw new Error("The required first-login staff password replacement failed.");
    if (await verifyPassword(temporaryPassword, secured.rows[0].password_hash))
      throw new Error("The temporary staff password remained valid after replacement.");

    console.log("Owner-created staff login and required password replacement passed.");
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

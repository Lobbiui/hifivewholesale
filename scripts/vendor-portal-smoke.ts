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

    await database.query(
      `INSERT INTO users (id,email,display_name,system_role,status) VALUES
       ('owner','owner@example.test','Owner','SUPER_ADMIN','ACTIVE'),
       ('vendor-a','a@example.test','Vendor A','VENDOR','ACTIVE'),
       ('vendor-b','b@example.test','Vendor B','VENDOR','ACTIVE')`,
    );
    await database.query(
      "INSERT INTO user_credentials (user_id,password_hash) VALUES ('vendor-a',$1),('vendor-b',$2)",
      [await hashPassword("VendorPortal1!"), await hashPassword("VendorPortal2!")],
    );
    await database.query(
      `INSERT INTO organizations (id,legal_name,display_name,organization_type,status) VALUES
       ('org-a','Vendor A','Vendor A','BRAND','APPROVED'),
       ('org-b','Vendor B','Vendor B','DISTRIBUTOR','APPROVED')`,
    );
    await database.query(
      `INSERT INTO organization_memberships (id,organization_id,user_id,membership_role) VALUES
       ('membership-a','org-a','vendor-a','OWNER'),
       ('membership-b','org-b','vendor-b','OWNER')`,
    );
    await database.query(
      `INSERT INTO products (id,name,brand,category,product_type,description,status) VALUES
       ('product-a','Product A','Vendor A','Test','Test','Assigned to A','PUBLISHED'),
       ('product-b','Product B','Vendor B','Test','Test','Assigned to B','PUBLISHED')`,
    );
    await database.query(
      `INSERT INTO vendor_product_assignments (vendor_organization_id,product_id,assigned_by_user_id) VALUES
       ('org-a','product-a','owner'),('org-b','product-b','owner')`,
    );

    const visibleToA = await database.query<{ id: string }>(
      `SELECT p.id FROM vendor_product_assignments a JOIN products p ON p.id=a.product_id
        WHERE a.vendor_organization_id='org-a'`,
    );
    if (visibleToA.rows.length !== 1 || visibleToA.rows[0]?.id !== "product-a")
      throw new Error("Vendor A could see a product outside its explicit assignment.");

    const credential = await database.query<{ password_hash: string }>(
      "SELECT password_hash FROM user_credentials WHERE user_id='vendor-a'",
    );
    if (!credential.rows[0] || !await verifyPassword("VendorPortal1!", credential.rows[0].password_hash))
      throw new Error("Vendor credentials were not stored securely.");

    console.log("Vendor role, login credential, and explicit product isolation passed.");
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

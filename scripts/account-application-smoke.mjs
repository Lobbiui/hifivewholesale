import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const database = new PGlite();

try {
  const migrationDirectory = path.join(process.cwd(), "db", "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    await database.exec(
      await readFile(path.join(migrationDirectory, migration), "utf8"),
    );
  }

  await database.query(
    `INSERT INTO buyer_applications (
      id,legal_business_name,contact_name,business_email,business_phone,
      resale_id,primary_territory,business_type,certification_accepted_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`,
    [
      "application_optional_resale_smoke",
      "Optional Resale Test",
      "Test Buyer",
      "optional-resale@example.test",
      "615-555-0100",
      null,
      "KY",
      "Retail store",
    ],
  );

  const result = await database.query(
    "SELECT resale_id FROM buyer_applications WHERE id=$1",
    ["application_optional_resale_smoke"],
  );
  if (!result.rows[0] || result.rows[0].resale_id !== null) {
    throw new Error("An application without a resale ID did not round-trip.");
  }

  await database.query(
    `INSERT INTO users (id,email,display_name,system_role,status)
     VALUES ('resale_review_admin','resale-review-admin@example.test','Resale Reviewer','ADMIN','ACTIVE')`,
  );
  await database.query(
    `INSERT INTO organizations (
      id,legal_name,display_name,organization_type,status,resale_id,
      resale_document_status,primary_territory
    ) VALUES ($1,$2,$2,'WHOLESALE_BUYER','APPROVED',$3,'PENDING',$4)`,
    ["resale_review_org", "Resale Review Test", "TEST-RESALE-123", "TN"],
  );
  await database.query(
    `UPDATE organizations
        SET resale_document_status='VERIFIED',
            resale_document_reviewed_at=CURRENT_TIMESTAMP,
            resale_document_reviewed_by='resale_review_admin',
            resale_document_notes='Verified during automated test.'
      WHERE id='resale_review_org'`,
  );
  const verification = await database.query(
    `SELECT resale_document_status,resale_document_reviewed_at,
            resale_document_reviewed_by,resale_document_notes
       FROM organizations WHERE id='resale_review_org'`,
  );
  const verified = verification.rows[0];
  if (
    verified?.resale_document_status !== "VERIFIED" ||
    !verified.resale_document_reviewed_at ||
    verified.resale_document_reviewed_by !== "resale_review_admin" ||
    verified.resale_document_notes !== "Verified during automated test."
  ) {
    throw new Error("Resale-document verification did not round-trip.");
  }
  console.log("Optional resale ID and tax-document verification passed.");
} finally {
  await database.close();
}

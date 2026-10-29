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
    `INSERT INTO users (id,email,display_name,system_role,status,must_change_password)
     VALUES ('temporary_password_buyer','temporary-password@example.test','Temporary Password Buyer','BUYER','ACTIVE',TRUE),
            ('activation_link_buyer','activation-link@example.test','Activation Link Buyer','BUYER','INVITED',FALSE)`,
  );
  const credentialInsertSql = `INSERT INTO user_credentials
    (user_id,password_hash,reset_token_hash,reset_token_expires_at)
    VALUES ($1,$2,$3::text,CASE WHEN $3::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP+INTERVAL '7 days' END)`;
  await database.query(credentialInsertSql, [
    "temporary_password_buyer",
    "temporary-password-hash",
    null,
  ]);
  await database.query(credentialInsertSql, [
    "activation_link_buyer",
    "pending-activation",
    "activation-token-hash",
  ]);
  const credentials = await database.query(
    `SELECT user_id,reset_token_hash,reset_token_expires_at
       FROM user_credentials
      WHERE user_id IN ('temporary_password_buyer','activation_link_buyer')
      ORDER BY user_id`,
  );
  const activationCredential = credentials.rows.find((row) => row.user_id === "activation_link_buyer");
  const temporaryCredential = credentials.rows.find((row) => row.user_id === "temporary_password_buyer");
  if (
    activationCredential?.reset_token_hash !== "activation-token-hash" ||
    !activationCredential.reset_token_expires_at ||
    temporaryCredential?.reset_token_hash !== null ||
    temporaryCredential.reset_token_expires_at !== null
  ) {
    throw new Error("Buyer credential creation did not preserve activation-token semantics.");
  }
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
  await database.query(
    `INSERT INTO customer_documents (
      id,organization_id,folder,display_name,filename,mime_type,size_bytes,
      file_bytes,uploaded_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      "tn_hdcp_document_smoke",
      "resale_review_org",
      "Licenses",
      "TN HDCP License",
      "tn-hdcp-license.pdf",
      "application/pdf",
      4,
      new Uint8Array([37, 80, 68, 70]),
      "resale_review_admin",
    ],
  );
  const document = await database.query(
    `SELECT organization_id,folder,display_name,size_bytes
       FROM customer_documents WHERE id='tn_hdcp_document_smoke'`,
  );
  if (
    document.rows[0]?.organization_id !== "resale_review_org" ||
    document.rows[0]?.folder !== "Licenses" ||
    document.rows[0]?.display_name !== "TN HDCP License" ||
    document.rows[0]?.size_bytes !== 4
  ) {
    throw new Error("Customer compliance document was not associated with the business.");
  }
  console.log("Optional resale ID, buyer credentials, tax verification, and customer document storage passed.");
} finally {
  await database.close();
}

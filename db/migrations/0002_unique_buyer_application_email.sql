CREATE UNIQUE INDEX IF NOT EXISTS buyer_applications_email_unique_idx
  ON buyer_applications (LOWER(business_email));

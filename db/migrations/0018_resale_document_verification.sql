ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS resale_document_status TEXT NOT NULL DEFAULT 'NOT_PROVIDED';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS resale_document_reviewed_at TIMESTAMPTZ;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS resale_document_reviewed_by TEXT REFERENCES users(id);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS resale_document_notes TEXT NOT NULL DEFAULT '';

UPDATE organizations
   SET resale_document_status = CASE
     WHEN NULLIF(BTRIM(resale_id), '') IS NULL THEN 'NOT_PROVIDED'
     ELSE 'PENDING'
   END
 WHERE organization_type = 'WHOLESALE_BUYER'
   AND resale_document_status = 'NOT_PROVIDED';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_resale_document_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_resale_document_status_check
  CHECK (resale_document_status IN ('NOT_PROVIDED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'));

CREATE INDEX IF NOT EXISTS organizations_resale_document_status_idx
  ON organizations (resale_document_status, updated_at DESC)
  WHERE organization_type = 'WHOLESALE_BUYER';

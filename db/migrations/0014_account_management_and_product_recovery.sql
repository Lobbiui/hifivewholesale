ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_expires_at DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS resale_authorization TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS account_manager_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS account_manager_phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS customer_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'General',
  display_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  file_bytes BYTEA NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS customer_documents_org_idx ON customer_documents(organization_id, folder, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'RETAIL',
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS customer_locations_org_idx ON customer_locations(organization_id, is_primary DESC, name);

CREATE TABLE IF NOT EXISTS customer_contact_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('PHONE','EMAIL','TEXT','WHATSAPP','FACEBOOK','IN_PERSON','OTHER')),
  subject TEXT NOT NULL,
  notes TEXT NOT NULL,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS customer_contact_logs_org_idx ON customer_contact_logs(organization_id, contacted_at DESC);

ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS archive_delete_after TIMESTAMPTZ;
UPDATE products SET archived_at=COALESCE(archived_at,updated_at), archive_delete_after=COALESCE(archive_delete_after,updated_at+INTERVAL '30 days') WHERE status='ARCHIVED';

ALTER TABLE product_assets ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE product_assets ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product_assets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE product_assets SET display_name=COALESCE(display_name,filename);

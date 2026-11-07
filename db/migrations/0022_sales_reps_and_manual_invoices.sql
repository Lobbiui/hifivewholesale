ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_system_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_system_role_check CHECK (
    system_role IN ('BUYER', 'SALES_REP', 'ADMIN', 'SUPER_ADMIN')
  );

CREATE TABLE IF NOT EXISTS sales_rep_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  commission_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (
    commission_rate_bps BETWEEN 0 AND 10000
  ),
  custom_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_rep_customer_assignments (
  sales_rep_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sales_rep_user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS sales_rep_customer_assignments_organization_idx
  ON sales_rep_customer_assignments(organization_id);

ALTER TABLE order_requests
  ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'BUYER_CHECKOUT',
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS sales_rep_user_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS invoice_status TEXT,
  ADD COLUMN IF NOT EXISTS invoice_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_notes TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate_bps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_earned_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_order_source_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_order_source_check CHECK (
    order_source IN ('BUYER_CHECKOUT', 'MANUAL_INVOICE')
  );

ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_invoice_status_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_invoice_status_check CHECK (
    invoice_status IS NULL OR invoice_status IN ('DRAFT', 'ISSUED', 'PAID', 'VOID')
  );

ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_commission_rate_bps_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_commission_rate_bps_check CHECK (
    commission_rate_bps BETWEEN 0 AND 10000
  );

ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_commission_earned_cents_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_commission_earned_cents_check CHECK (
    commission_earned_cents >= 0
  );

CREATE INDEX IF NOT EXISTS order_requests_sales_rep_idx
  ON order_requests(sales_rep_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS order_requests_manual_invoice_idx
  ON order_requests(order_source, invoice_status, invoice_expires_at);

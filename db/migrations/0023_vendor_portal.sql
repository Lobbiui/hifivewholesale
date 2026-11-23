ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_system_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_system_role_check CHECK (
    system_role IN ('BUYER', 'VENDOR', 'SALES_REP', 'ADMIN', 'SUPER_ADMIN')
  );

CREATE TABLE IF NOT EXISTS vendor_product_assignments (
  vendor_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vendor_organization_id, product_id)
);

CREATE INDEX IF NOT EXISTS vendor_product_assignments_product_idx
  ON vendor_product_assignments(product_id);

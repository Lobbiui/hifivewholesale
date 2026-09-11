CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  organization_type TEXT NOT NULL CHECK (organization_type IN ('INTERNAL', 'WHOLESALE_BUYER', 'BRAND', 'DISTRIBUTOR')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED', 'DECLINED')),
  resale_id TEXT,
  primary_territory TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('WAREHOUSE', 'RETAIL', 'OFFICE')),
  fulfillment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  address_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  system_role TEXT NOT NULL DEFAULT 'BUYER' CHECK (system_role IN ('BUYER', 'ADMIN', 'SUPER_ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL DEFAULT 'BUYER' CHECK (membership_role IN ('OWNER', 'BUYER', 'APPROVER', 'VIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS buyer_applications (
  id TEXT PRIMARY KEY,
  legal_business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  business_email TEXT NOT NULL,
  business_phone TEXT NOT NULL,
  resale_id TEXT NOT NULL,
  primary_territory TEXT NOT NULL,
  business_type TEXT NOT NULL,
  website_url TEXT,
  certification_accepted_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'MORE_INFO_REQUIRED')),
  organization_id TEXT REFERENCES organizations(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES users(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS buyer_applications_email_idx ON buyer_applications(LOWER(business_email));
CREATE INDEX IF NOT EXISTS buyer_applications_status_idx ON buyer_applications(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS clover_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  environment TEXT NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  region TEXT NOT NULL DEFAULT 'NA' CHECK (region IN ('NA', 'EU', 'LATAM', 'APAC')),
  merchant_id TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'DISCONNECTED' CHECK (connection_status IN ('DISCONNECTED', 'CONNECTED', 'REAUTH_REQUIRED', 'ERROR')),
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (environment, region, merchant_id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  upc TEXT,
  variant_name TEXT NOT NULL,
  units_per_case INTEGER CHECK (units_per_case > 0),
  wholesale_price_cents INTEGER CHECK (wholesale_price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  safety_stock_units INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock_units >= 0),
  online_sellable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_unique ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_upc_unique ON product_variants(upc) WHERE upc IS NOT NULL;

CREATE TABLE IF NOT EXISTS location_item_mappings (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
  clover_merchant_id TEXT NOT NULL,
  clover_item_id TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'REVIEW' CHECK (mapping_status IN ('MAPPED', 'REVIEW', 'AMBIGUOUS', 'MISSING', 'DISABLED')),
  verified_at TIMESTAMPTZ,
  verified_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (location_id, product_variant_id),
  UNIQUE (clover_merchant_id, clover_item_id)
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
  on_hand_units INTEGER NOT NULL,
  reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
  safety_stock_units INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock_units >= 0),
  source TEXT NOT NULL CHECK (source IN ('CLOVER', 'SEVEN_SPACES_VERIFIED', 'RECONCILIATION', 'MANUAL')),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inventory_snapshots_latest_idx ON inventory_snapshots(location_id, product_variant_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  buyer_user_id TEXT NOT NULL REFERENCES users(id),
  fulfillment_location_id TEXT NOT NULL REFERENCES locations(id),
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'STOCK_CHECKED', 'RESERVED', 'PAYMENT_AUTHORIZED', 'ORDER_CONFIRMED', 'INVENTORY_SYNC_PENDING', 'INVENTORY_SYNCED', 'FULFILLMENT_PENDING', 'COMPLETED', 'PAYMENT_FAILED', 'OUT_OF_STOCK', 'CLOVER_ORDER_PENDING', 'CANCEL_PENDING_RESTOCK', 'REFUND_PENDING_RESTOCK', 'NEEDS_REVIEW', 'CANCELLED', 'REFUNDED')),
  fulfillment_method TEXT NOT NULL CHECK (fulfillment_method IN ('PICKUP', 'DELIVERY', 'FREIGHT')),
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  purchase_order_number TEXT,
  payment_provider_reference TEXT,
  clover_order_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_clover_order_unique ON orders(clover_order_id) WHERE clover_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
  product_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT,
  clover_item_id_snapshot TEXT NOT NULL,
  cases_ordered INTEGER NOT NULL CHECK (cases_ordered > 0),
  units_per_case INTEGER NOT NULL CHECK (units_per_case > 0),
  inventory_units INTEGER NOT NULL CHECK (inventory_units > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id),
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
  quantity_units INTEGER NOT NULL CHECK (quantity_units > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inventory_reservations_active_idx ON inventory_reservations(location_id, product_variant_id, status, expires_at);

CREATE TABLE IF NOT EXISTS integration_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  merchant_id TEXT,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'RETRY', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS integration_jobs_ready_idx ON integration_jobs(status, available_at);

CREATE TABLE IF NOT EXISTS order_exceptions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_by TEXT REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  action TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  reason TEXT,
  before_json JSONB,
  after_json JSONB,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_events_aggregate_idx ON audit_events(aggregate_type, aggregate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_user_id, created_at DESC);

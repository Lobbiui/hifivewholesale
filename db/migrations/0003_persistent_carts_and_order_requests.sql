CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONVERTED', 'ABANDONED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS carts_active_buyer_unique
  ON carts (buyer_user_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  catalog_product_id TEXT NOT NULL,
  quantity_cases INTEGER NOT NULL CHECK (quantity_cases > 0),
  product_snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cart_id, catalog_product_id)
);

CREATE TABLE IF NOT EXISTS order_requests (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  buyer_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'SUBMITTED_FOR_REVIEW' CHECK (state IN ('SUBMITTED_FOR_REVIEW', 'PRICING_REVIEW', 'READY_FOR_CHECKOUT', 'CONVERTED', 'DECLINED')),
  fulfillment_method TEXT NOT NULL CHECK (fulfillment_method IN ('PICKUP', 'DELIVERY')),
  contact_email TEXT NOT NULL,
  purchase_order_number TEXT,
  estimated_total_cents INTEGER,
  pricing_pending BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_requests_buyer_idx
  ON order_requests (buyer_user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS order_request_items (
  id TEXT PRIMARY KEY,
  order_request_id TEXT NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  catalog_product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  quantity_cases INTEGER NOT NULL CHECK (quantity_cases > 0),
  case_price_cents INTEGER,
  product_snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

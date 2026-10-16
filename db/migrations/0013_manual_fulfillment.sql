CREATE TABLE IF NOT EXISTS order_fulfillments (
  id TEXT PRIMARY KEY,
  order_request_id TEXT NOT NULL UNIQUE REFERENCES order_requests(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('UPS', 'DIRECT_DELIVERY', 'PICKUP')),
  status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN (
    'PROCESSING',
    'READY_TO_SHIP',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_EXCEPTION'
  )),
  tracking_number TEXT,
  tracking_url TEXT,
  service_level TEXT,
  package_count INTEGER NOT NULL DEFAULT 1 CHECK (package_count > 0),
  shipping_cost_cents INTEGER CHECK (shipping_cost_cents >= 0),
  estimated_delivery_date DATE,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  driver_notes TEXT,
  customer_notes TEXT,
  proof_filename TEXT,
  proof_content_type TEXT,
  proof_size_bytes INTEGER,
  proof_data BYTEA,
  proof_uploaded_at TIMESTAMPTZ,
  last_notified_status TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_fulfillments_status_idx
  ON order_fulfillments(status, updated_at DESC);


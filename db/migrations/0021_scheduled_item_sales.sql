CREATE TABLE IF NOT EXISTS product_variant_sales (
  id TEXT PRIMARY KEY,
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  canceled_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  canceled_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS product_variant_sales_variant_window_idx
  ON product_variant_sales(product_variant_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS product_variant_sales_available_idx
  ON product_variant_sales(product_variant_id, ends_at)
  WHERE canceled_at IS NULL;

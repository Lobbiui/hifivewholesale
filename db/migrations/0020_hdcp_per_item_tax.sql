ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hdcp_tax_profile TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS hdcp_tax_value NUMERIC(14,4) NOT NULL DEFAULT 0;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_hdcp_tax_profile_check;

ALTER TABLE products
  ADD CONSTRAINT products_hdcp_tax_profile_check CHECK (
    hdcp_tax_profile IN (
      'NONE',
      'FIXED_PER_CASE',
      'PERCENT_OF_LINE',
      'CANNABINOID_MG',
      'FLOWER_OUNCE',
      'LIQUID_ML',
      'INHALABLE_LIQUID_ML'
    )
  );

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_hdcp_tax_value_check;

ALTER TABLE products
  ADD CONSTRAINT products_hdcp_tax_value_check CHECK (hdcp_tax_value >= 0);

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS hdcp_tax_profile TEXT,
  ADD COLUMN IF NOT EXISTS hdcp_tax_value NUMERIC(14,4);

ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_hdcp_tax_profile_check;

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_hdcp_tax_profile_check CHECK (
    hdcp_tax_profile IS NULL OR hdcp_tax_profile IN (
      'NONE',
      'FIXED_PER_CASE',
      'PERCENT_OF_LINE',
      'CANNABINOID_MG',
      'FLOWER_OUNCE',
      'LIQUID_ML',
      'INHALABLE_LIQUID_ML'
    )
  );

ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_hdcp_tax_value_check;

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_hdcp_tax_value_check CHECK (
    hdcp_tax_value IS NULL OR hdcp_tax_value >= 0
  );

ALTER TABLE order_requests
  ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hdcp_tax_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_tax_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_subtotal_cents_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_subtotal_cents_check CHECK (subtotal_cents >= 0);
ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_hdcp_tax_cents_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_hdcp_tax_cents_check CHECK (hdcp_tax_cents >= 0);
ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_sales_tax_cents_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_sales_tax_cents_check CHECK (sales_tax_cents >= 0);
ALTER TABLE order_requests
  DROP CONSTRAINT IF EXISTS order_requests_shipping_cents_check;
ALTER TABLE order_requests
  ADD CONSTRAINT order_requests_shipping_cents_check CHECK (shipping_cents >= 0);

UPDATE order_requests
SET subtotal_cents = COALESCE(estimated_total_cents, 0)
WHERE subtotal_cents = 0
  AND COALESCE(estimated_total_cents, 0) > 0;

ALTER TABLE order_request_items
  ADD COLUMN IF NOT EXISTS line_subtotal_cents INTEGER,
  ADD COLUMN IF NOT EXISTS hdcp_tax_profile TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS hdcp_tax_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hdcp_tax_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hdcp_tax_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE order_request_items
SET line_subtotal_cents = case_price_cents * quantity_cases
WHERE line_subtotal_cents IS NULL
  AND case_price_cents IS NOT NULL;

ALTER TABLE order_request_items
  DROP CONSTRAINT IF EXISTS order_request_items_line_subtotal_cents_check;
ALTER TABLE order_request_items
  ADD CONSTRAINT order_request_items_line_subtotal_cents_check CHECK (
    line_subtotal_cents IS NULL OR line_subtotal_cents >= 0
  );
ALTER TABLE order_request_items
  DROP CONSTRAINT IF EXISTS order_request_items_hdcp_tax_profile_check;
ALTER TABLE order_request_items
  ADD CONSTRAINT order_request_items_hdcp_tax_profile_check CHECK (
    hdcp_tax_profile IN (
      'NONE',
      'FIXED_PER_CASE',
      'PERCENT_OF_LINE',
      'CANNABINOID_MG',
      'FLOWER_OUNCE',
      'LIQUID_ML',
      'INHALABLE_LIQUID_ML'
    )
  );
ALTER TABLE order_request_items
  DROP CONSTRAINT IF EXISTS order_request_items_hdcp_tax_value_check;
ALTER TABLE order_request_items
  ADD CONSTRAINT order_request_items_hdcp_tax_value_check CHECK (hdcp_tax_value >= 0);
ALTER TABLE order_request_items
  DROP CONSTRAINT IF EXISTS order_request_items_hdcp_tax_cents_check;
ALTER TABLE order_request_items
  ADD CONSTRAINT order_request_items_hdcp_tax_cents_check CHECK (hdcp_tax_cents >= 0);

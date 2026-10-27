ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tn_registered_upc TEXT,
  ADD COLUMN IF NOT EXISTS case_cost_cents INTEGER;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS case_cost_cents INTEGER;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_case_cost_cents_nonnegative;
ALTER TABLE products
  ADD CONSTRAINT products_case_cost_cents_nonnegative
  CHECK (case_cost_cents IS NULL OR case_cost_cents >= 0);

ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_case_cost_cents_nonnegative;
ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_case_cost_cents_nonnegative
  CHECK (case_cost_cents IS NULL OR case_cost_cents >= 0);

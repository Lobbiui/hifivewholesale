ALTER TABLE products ADD COLUMN IF NOT EXISTS product_line TEXT;

CREATE INDEX IF NOT EXISTS products_product_line_lookup
  ON products (LOWER(product_line))
  WHERE product_line IS NOT NULL;

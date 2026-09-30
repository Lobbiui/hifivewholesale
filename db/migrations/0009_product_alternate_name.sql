ALTER TABLE products ADD COLUMN IF NOT EXISTS alternate_name TEXT;

CREATE INDEX IF NOT EXISTS products_alternate_name_lookup
  ON products (LOWER(alternate_name))
  WHERE alternate_name IS NOT NULL;

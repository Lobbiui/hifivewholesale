ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'Uncategorized';

CREATE TABLE IF NOT EXISTS catalog_categories (
  name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_product_types (
  name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO catalog_categories (name)
SELECT DISTINCT category FROM products WHERE category <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO catalog_categories (name) VALUES ('Uncategorized')
ON CONFLICT (name) DO NOTHING;

INSERT INTO catalog_product_types (name) VALUES
  ('Cartridge'), ('Disposable'), ('Gummy'), ('Flower'), ('Beverage'), ('Edible'), ('Uncategorized')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS product_assets (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('IMAGE', 'COA')),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_bytes BYTEA NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS product_assets_product_idx
  ON product_assets (product_id, asset_type, created_at);

CREATE TABLE IF NOT EXISTS product_catalog_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  strength TEXT NOT NULL DEFAULT '',
  flavor TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6f2dbd',
  accent TEXT NOT NULL DEFAULT '#c99cff',
  badge TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  coa_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_logo_url TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_source_mappings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, source_key)
);

CREATE TABLE IF NOT EXISTS catalog_imports (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  import_type TEXT NOT NULL CHECK (import_type IN ('CLOVER_INVENTORY', 'FULL_CATALOG')),
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  row_count INTEGER NOT NULL DEFAULT 0,
  created_products INTEGER NOT NULL DEFAULT 0,
  updated_products INTEGER NOT NULL DEFAULT 0,
  inventory_updated INTEGER NOT NULL DEFAULT 0,
  draft_products INTEGER NOT NULL DEFAULT 0,
  zero_quantity_rows INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS catalog_imports_created_at_idx ON catalog_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_source_mappings_variant_idx ON catalog_source_mappings(product_variant_id);

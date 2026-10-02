ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS coa_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE product_assets ADD COLUMN IF NOT EXISTS product_variant_id TEXT REFERENCES product_variants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS product_assets_variant_idx
  ON product_assets (product_variant_id, asset_type, created_at);

INSERT INTO catalog_product_types (name) VALUES ('Gummy')
ON CONFLICT (name) DO NOTHING;

UPDATE products
SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
WHERE LOWER(brand) <> 'chewbies';

UPDATE product_variants
SET online_sellable = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE product_id IN (SELECT id FROM products WHERE LOWER(brand) <> 'chewbies');

UPDATE products
SET product_type = 'Gummy', category = 'Gummies', status = 'PUBLISHED',
    published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
WHERE LOWER(brand) = 'chewbies';

UPDATE product_variants
SET online_sellable = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE product_id IN (SELECT id FROM products WHERE LOWER(brand) = 'chewbies');

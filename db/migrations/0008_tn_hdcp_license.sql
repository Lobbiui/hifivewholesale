ALTER TABLE buyer_applications ADD COLUMN IF NOT EXISTS tn_hdcp_license_filename TEXT;
ALTER TABLE buyer_applications ADD COLUMN IF NOT EXISTS tn_hdcp_license_content_type TEXT;
ALTER TABLE buyer_applications ADD COLUMN IF NOT EXISTS tn_hdcp_license_size_bytes INTEGER;
ALTER TABLE buyer_applications ADD COLUMN IF NOT EXISTS tn_hdcp_license_data BYTEA;
ALTER TABLE buyer_applications ADD COLUMN IF NOT EXISTS tn_hdcp_license_submitted_at TIMESTAMPTZ;

UPDATE organizations
SET legal_name = REPLACE(legal_name, 'Hi-Five', 'HiFive'),
    display_name = REPLACE(display_name, 'Hi-Five', 'HiFive')
WHERE legal_name LIKE '%Hi-Five%' OR display_name LIKE '%Hi-Five%';

UPDATE buyer_applications
SET legal_business_name = REPLACE(legal_business_name, 'Hi-Five', 'HiFive')
WHERE legal_business_name LIKE '%Hi-Five%';

CREATE TABLE IF NOT EXISTS order_request_notes (
  id TEXT PRIMARY KEY,
  order_request_id TEXT NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  recipient TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'US',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  assigned_to TEXT REFERENCES users(id),
  unread_by_admin INTEGER NOT NULL DEFAULT 0,
  unread_by_buyer INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('BUYER','ADMIN')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chat_conversations_updated_idx ON chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS brand_applications (
  id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  website_url TEXT NOT NULL,
  categories TEXT NOT NULL,
  markets TEXT NOT NULL,
  monthly_volume TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','REVIEW','SAMPLES_REQUESTED','APPROVED','DECLINED')),
  notes TEXT NOT NULL DEFAULT '',
  assigned_to TEXT REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  tier TEXT NOT NULL DEFAULT 'MEMBER',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_rules (
  id TEXT PRIMARY KEY,
  points_per_dollar NUMERIC(10,2) NOT NULL DEFAULT 1,
  redemption_cents_per_point NUMERIC(10,4) NOT NULL DEFAULT 1,
  promotional_multiplier NUMERIC(10,2) NOT NULL DEFAULT 1,
  tiers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT','FIXED','FREE_FREIGHT','POINTS_MULTIPLIER')),
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','SCHEDULED','EXPIRED','DISABLED')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_unique ON promotions(LOWER(code));

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  tag TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED')),
  publish_at TIMESTAMPTZ,
  author_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributor_leads (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'APPLICATION' CHECK (stage IN ('APPLICATION','QUALIFIED','NEGOTIATION','APPROVED','DECLINED')),
  notes TEXT NOT NULL DEFAULT '',
  assigned_to TEXT REFERENCES users(id),
  follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wholesale_price_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  minimum_cases INTEGER NOT NULL CHECK (minimum_cases > 0),
  discount_percent NUMERIC(6,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_settings (
  country_code TEXT PRIMARY KEY,
  market_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('ACTIVE','REVIEW','DISABLED')),
  pickup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  shipping_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','SKIPPED')),
  provider_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

INSERT INTO loyalty_rules (id, points_per_dollar, redemption_cents_per_point, promotional_multiplier, tiers_json)
VALUES ('default', 1, 1, 1, '[{"name":"Member","minimumPoints":0},{"name":"Silver","minimumPoints":2500},{"name":"Gold","minimumPoints":7500}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_settings (country_code, market_name, currency, status, pickup_enabled, delivery_enabled, shipping_notes)
VALUES ('US','United States','USD','ACTIVE',TRUE,TRUE,'Wholesale fulfillment subject to account and jurisdiction review.')
ON CONFLICT (country_code) DO NOTHING;

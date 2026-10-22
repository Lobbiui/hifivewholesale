ALTER TABLE order_requests
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','PENDING','PAID','HELD','DECLINED','FAILED','VOIDED','PARTIALLY_REFUNDED','REFUNDED')),
  ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_cents >= 0),
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  order_request_id TEXT NOT NULL REFERENCES order_requests(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK (operation IN ('CHARGE','VOID','REFUND')),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','DECLINED','HELD','ERROR')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  provider TEXT NOT NULL DEFAULT 'AUTHORIZE_NET',
  provider_transaction_id TEXT,
  reference_transaction_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  response_code TEXT,
  response_reason_code TEXT,
  response_message TEXT,
  authorization_code TEXT,
  account_type TEXT,
  masked_account_number TEXT,
  initiated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx
  ON payment_transactions(order_request_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_one_pending_action
  ON payment_transactions(order_request_id, operation)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_reference_unique
  ON payment_transactions(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL AND provider_transaction_id <> '0';

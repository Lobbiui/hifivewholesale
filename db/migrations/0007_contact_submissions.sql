CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  business_email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL,
  interest TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','CLOSED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS contact_submissions_status_idx ON contact_submissions(status,submitted_at DESC);

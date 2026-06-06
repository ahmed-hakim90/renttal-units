-- Server-side login rate limit buckets.
-- Values are HMAC hashes so raw emails and IP addresses are not stored.
CREATE TABLE auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_rate_limits_email_hash ON auth_rate_limits(email_hash);
CREATE INDEX idx_auth_rate_limits_locked_until ON auth_rate_limits(locked_until);
CREATE INDEX idx_auth_rate_limits_updated_at ON auth_rate_limits(updated_at);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

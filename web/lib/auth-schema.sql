-- Auth.js (@auth/pg-adapter) tables — exact schema the adapter expects:
-- https://authjs.dev/getting-started/adapters/pg
-- Run once against the app DB; safe to re-run (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS verification_token
(
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,

  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS users
(
  id SERIAL,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  -- Tracks what set the current `image`, so a later-connected OAuth provider
  -- never silently overwrites an avatar that's already "locked in" — see
  -- events.linkAccount / events.createUser in web/auth.ts.
  avatar_source TEXT,
  role VARCHAR(255),

  PRIMARY KEY (id),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS accounts
(
  id SERIAL,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,

  PRIMARY KEY (id),
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions
(
  id SERIAL,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL,

  PRIMARY KEY (id),
  UNIQUE ("sessionToken")
);

-- Custom Email-OTP flow (Auth.js's stock Email provider sends magic links, not
-- numeric codes — this app-specific table backs a Credentials provider instead).
CREATE TABLE IF NOT EXISTS email_otp_codes
(
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index matching the actual lookup in verifyCode() (unconsumed codes
-- for an email, most recent first) — a plain email-only index would still
-- need to scan every historical row for that address.
CREATE INDEX IF NOT EXISTS idx_email_otp_codes_active
  ON email_otp_codes (email, created_at DESC)
  WHERE consumed_at IS NULL;

-- Server-side applied/ignored status, keyed by user — replaces localStorage-only
-- StatusProvider for signed-in users so status syncs across devices.
CREATE TABLE IF NOT EXISTS user_job_status
(
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE ("userId", job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_job_status_user ON user_job_status ("userId");

-- Generic sliding-window rate limiter (web/lib/rate-limit.ts) — one row per allowed hit,
-- keyed by an arbitrary bucket (e.g. "otp-request-ip", "add-company-ip") and
-- key (e.g. an IP). Old rows are opportunistically deleted on every write,
-- same as email_otp_codes above, so this never grows unbounded.
CREATE TABLE IF NOT EXISTS rate_limit_hits
(
  id SERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup ON rate_limit_hits (bucket, key, created_at);

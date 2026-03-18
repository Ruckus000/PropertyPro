-- 0103: Add OTP rate-limiting columns to users table.
-- Replaces in-memory Map-based rate limiting that was ineffective on Vercel serverless.

ALTER TABLE users
  ADD COLUMN otp_last_sent_at TIMESTAMPTZ,
  ADD COLUMN otp_failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN otp_locked_until TIMESTAMPTZ;

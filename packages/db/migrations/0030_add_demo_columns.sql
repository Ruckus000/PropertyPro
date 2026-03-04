-- Add demo columns to communities table.
-- Marks admin-created demo communities and reserves a column for future auto-expiry.
-- IF NOT EXISTS guards added for idempotency (is_demo may already exist on live DBs).
ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

COMMENT ON COLUMN communities.is_demo IS 'True for demo communities created via admin console';
COMMENT ON COLUMN communities.demo_expires_at IS 'Unused — demos persist until manually deleted. Column retained for future use';

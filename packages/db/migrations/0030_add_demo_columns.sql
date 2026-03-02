ALTER TABLE communities ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE communities ADD COLUMN demo_expires_at timestamptz;

-- Mark existing communities as non-demo explicitly
UPDATE communities SET is_demo = false WHERE is_demo = false;

COMMENT ON COLUMN communities.is_demo IS 'True for demo communities created via admin console';
COMMENT ON COLUMN communities.demo_expires_at IS 'Unused — demos persist until manually deleted. Column retained for future use';

-- Migration 0122: trial_ends_at column + backfill
-- Adds the trial boundary timestamp to communities for the 14+7 demo lifecycle model.

-- 1. Add column
ALTER TABLE communities ADD COLUMN trial_ends_at timestamptz;

-- 2. CHECK constraint: trial_ends_at must be <= demo_expires_at for demos
ALTER TABLE communities ADD CONSTRAINT chk_demo_trial_ordering
  CHECK (
    NOT is_demo
    OR trial_ends_at IS NULL
    OR demo_expires_at IS NULL
    OR trial_ends_at <= demo_expires_at
  );

-- 3. Create-path enforcement trigger (INSERT only)
CREATE OR REPLACE FUNCTION enforce_demo_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_demo = true AND (NEW.trial_ends_at IS NULL OR NEW.demo_expires_at IS NULL) THEN
    RAISE EXCEPTION 'Demo communities must have both trial_ends_at and demo_expires_at';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_demo_timestamps
  BEFORE INSERT ON communities
  FOR EACH ROW
  EXECUTE FUNCTION enforce_demo_timestamps();

-- 4. Backfill existing demos: trial_ends_at = demo_expires_at - 7 days
UPDATE communities
SET trial_ends_at = demo_expires_at - interval '7 days'
WHERE is_demo = true
  AND deleted_at IS NULL
  AND demo_expires_at IS NOT NULL;

-- 5. Backfill grace_started events for demos already in grace
INSERT INTO conversion_events (
  demo_id, community_id, event_type, source, dedupe_key,
  occurred_at, recorded_at, metadata
)
SELECT
  di.id, c.id, 'grace_started', 'cron',
  'demo:' || di.id || ':grace_started',
  c.trial_ends_at, now(), '{}'::jsonb
FROM communities c
JOIN demo_instances di ON di.seeded_community_id = c.id
WHERE c.is_demo = true
  AND c.deleted_at IS NULL
  AND c.trial_ends_at IS NOT NULL
  AND c.trial_ends_at < now()
ON CONFLICT (dedupe_key) DO NOTHING;

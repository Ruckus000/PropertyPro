-- 0113_demo_lifecycle.sql
-- Add soft-delete to demo_instances (schema convention: all tenant-scoped tables)
ALTER TABLE demo_instances
  ADD COLUMN deleted_at timestamptz;

-- Backfill demo_expires_at for existing demos (30-day default)
UPDATE communities c
SET demo_expires_at = di.created_at + interval '30 days'
FROM demo_instances di
WHERE di.seeded_community_id = c.id
  AND c.is_demo = true
  AND c.demo_expires_at IS NULL;

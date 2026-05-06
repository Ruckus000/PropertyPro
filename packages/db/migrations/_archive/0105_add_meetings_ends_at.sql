ALTER TABLE meetings
  ADD COLUMN ends_at timestamptz;

UPDATE meetings
SET ends_at = starts_at + interval '1 hour'
WHERE ends_at IS NULL;

COMMENT ON COLUMN meetings.ends_at IS 'Optional meeting end time. Nullable; consumers fall back to starts_at + 1 hour when NULL.';

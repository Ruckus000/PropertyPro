-- Add cancellation reason capture columns to communities.
-- Reason is validated at the API boundary via Zod; not a DB enum for easier evolution.

ALTER TABLE communities
  ADD COLUMN cancellation_reason text,
  ADD COLUMN cancellation_note text,
  ADD COLUMN cancellation_captured_at timestamptz;

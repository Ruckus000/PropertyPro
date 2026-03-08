-- Add transparency page controls and checklist conditional marker.
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS transparency_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transparency_acknowledged_at TIMESTAMPTZ;

ALTER TABLE compliance_checklist_items
  ADD COLUMN IF NOT EXISTS is_conditional BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN communities.transparency_enabled IS 'Public compliance transparency page opt-in toggle';
COMMENT ON COLUMN communities.transparency_acknowledged_at IS 'Timestamp of first transparency scope acknowledgment';
COMMENT ON COLUMN compliance_checklist_items.is_conditional IS 'True when checklist item may not apply to every association';

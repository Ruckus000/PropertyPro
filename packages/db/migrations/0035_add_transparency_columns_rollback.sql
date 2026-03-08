-- Emergency rollback for 0035_add_transparency_columns.sql
ALTER TABLE compliance_checklist_items
  DROP COLUMN IF EXISTS is_conditional;

ALTER TABLE communities
  DROP COLUMN IF EXISTS transparency_acknowledged_at,
  DROP COLUMN IF EXISTS transparency_enabled;

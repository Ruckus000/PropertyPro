-- Add is_applicable column to compliance_checklist_items
-- Defaults to TRUE; when marked FALSE, the item shows as "not_applicable" status.
-- Distinct from is_conditional (which marks items that *might* not apply);
-- is_applicable is the runtime flag set by the user.
ALTER TABLE compliance_checklist_items
  ADD COLUMN is_applicable boolean NOT NULL DEFAULT true;

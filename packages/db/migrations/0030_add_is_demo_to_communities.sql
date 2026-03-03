-- Add is_demo flag to communities table.
-- Marks seeded/demo communities so they can be distinguished from real tenants.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

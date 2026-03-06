-- Fix unique constraint to exclude soft-deleted rows.
-- Ghost rows (deleted_at IS NOT NULL) block publishing with duplicate key errors.

-- Clean up ghost rows
DELETE FROM site_blocks WHERE deleted_at IS NOT NULL;

-- Drop the existing non-partial unique constraint (try both possible names)
ALTER TABLE site_blocks DROP CONSTRAINT IF EXISTS site_blocks_community_id_block_order_is_draft_key;
ALTER TABLE site_blocks DROP CONSTRAINT IF EXISTS site_blocks_community_order_draft_unique;

-- Create partial unique index that excludes soft-deleted rows
CREATE UNIQUE INDEX site_blocks_community_block_order_draft_unique
  ON site_blocks (community_id, block_order, is_draft)
  WHERE deleted_at IS NULL;

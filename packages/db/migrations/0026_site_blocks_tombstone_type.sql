-- Migration 0026: add the 'tombstone' sentinel to the site_blocks CHECK
--
-- Block deletion in the PM site editor is staged through the draft layer:
-- deleting a published section inserts a draft row with
-- block_type = 'tombstone', and publishCommunitySite retires the published
-- row at that order while never promoting the tombstone itself. The
-- block_type CHECK constraint (last set in migration 0010) does not admit
-- the sentinel, so any staged deletion would violate it. This migration
-- widens the constraint.
--
-- 'tombstone' is intentionally NOT in the shared BlockType union or any
-- API contract enum — it can only be written by the DELETE
-- /api/v1/pm/site/blocks handler, never by the upsert path.
--
-- Widening a CHECK is non-destructive: every existing row already satisfies
-- the new predicate, so the ALTER cannot fail on existing data and no row
-- rewrite is required. Expand-style migration — safe to apply before the
-- code that writes tombstones ships.

BEGIN;

ALTER TABLE site_blocks
  DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE site_blocks
  ADD CONSTRAINT site_blocks_block_type_check
  CHECK (block_type IN (
    'hero', 'text', 'image',
    'documents', 'meetings', 'announcements', 'contact',
    'faq', 'gallery', 'amenities',
    'tombstone'
  ));

COMMIT;

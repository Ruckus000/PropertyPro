-- Migration 0010: add Pro+ polish block types to the site_blocks CHECK
--
-- PR #10 introduces three Pro-tier "polish" block types — faq, gallery,
-- amenities — gated to the hasSitePolishBlocks plan feature at the write
-- path. The block_type CHECK constraint (last set in migration 0008) lists
-- only the 7 v1 types, so any INSERT/UPDATE writing a polish block would
-- violate it. This migration widens the constraint to admit the three new
-- types.
--
-- Widening a CHECK is non-destructive: every existing row already satisfies
-- the new predicate (the original 7 values remain valid), so the ALTER
-- cannot fail on existing data and no row rewrite is required.

BEGIN;

ALTER TABLE site_blocks
  DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE site_blocks
  ADD CONSTRAINT site_blocks_block_type_check
  CHECK (block_type IN (
    'hero', 'text', 'image',
    'documents', 'meetings', 'announcements', 'contact',
    'faq', 'gallery', 'amenities'
  ));

COMMIT;

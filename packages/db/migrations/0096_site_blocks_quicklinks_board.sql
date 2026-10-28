-- Migration 0096: add the 'quicklinks' and 'board' block types to the site_blocks CHECK
--
-- Website builder, Phase 2A (the read release). Two new site sections:
--   quicklinks  a short row of links to the page's other sections, plus owner sign in
--   board       the names and titles of the people who hold a board seat
-- Both are views of data the community already has, so their stored content is
-- only { hidden? } and { heading?, hidden? }. Nothing writes either type yet:
-- this release ships the database permission and the renderers, and the release
-- after it is the first to write one.
--
-- The block_type list is a CHECK constraint, not an enum (last set in migration
-- 0044, which added 'payments'). A new block type is therefore a DDL change even
-- though the content itself is jsonb, and it is the easy half to forget: without
-- it the first INSERT of either type fails the constraint at write time.
--
-- Widening a CHECK is non-destructive: every existing row already satisfies the
-- new predicate, so the ALTER cannot fail on existing data and no row rewrite is
-- required. EXPAND migration: apply BEFORE the code that writes these types
-- ships. The DROP and the ADD share one transaction, so there is never a moment
-- when the table has no constraint.
--
-- The list below is 0044's list plus the two new types, 'tombstone' last. It
-- must name the same types, in the same order, as the check() literal in
-- packages/db/src/schema/site-blocks.ts, which the 0096 snapshot records. If
-- the two disagree, drizzle's model of the table is wrong and the next
-- generated migration silently drops or re-adds a type.
--
-- No new table, so RLS_EXPECTED_TENANT_TABLE_COUNT does not move.

BEGIN;

ALTER TABLE site_blocks
  DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE site_blocks
  ADD CONSTRAINT site_blocks_block_type_check
  CHECK (block_type IN (
    'hero', 'text', 'image',
    'documents', 'meetings', 'announcements', 'contact',
    'faq', 'gallery', 'amenities',
    'payments',
    'quicklinks', 'board',
    'tombstone'
  ));

COMMIT;

-- Migration 0044: add the 'payments' block type to the site_blocks CHECK
--
-- Website editor v3, Phase 9 (gap-analysis row 23). The payments block gives
-- a community's public site a single, prominent "Pay your assessment" panel.
-- It links either to the resident portal's /payments (built with
-- buildCommunityUrl) or, when the association uses a third-party processor —
-- ClickPay, Zego and PayLease between them cover most Florida associations —
-- to a PM-supplied https URL validated by the existing ctaTargetSchema.
--
-- The block itself never takes a payment and never touches card details; it
-- is a link. That is what keeps v3's "no card details touch your website"
-- copy accurate.
--
-- The block_type list is a CHECK constraint, not an enum (last set in
-- migration 0026, which added the 'tombstone' sentinel). A new block type is
-- therefore a DDL change even though the content itself is jsonb, and it is
-- the easy half of this to forget: without it every INSERT of a payments
-- block fails the constraint at write time.
--
-- Widening a CHECK is non-destructive: every existing row already satisfies
-- the new predicate, so the ALTER cannot fail on existing data and no row
-- rewrite is required. Expand-style — safe to apply BEFORE the code that
-- writes payments blocks ships, and it must be, since the writing code would
-- otherwise 500 on its first save.
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
    'tombstone'
  ));

COMMIT;

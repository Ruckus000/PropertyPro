-- Add template_variant column to site_blocks for public/mobile template support.
-- Existing rows are backfilled as 'public' via the DEFAULT clause.

ALTER TABLE site_blocks ADD COLUMN template_variant TEXT NOT NULL DEFAULT 'public';

ALTER TABLE site_blocks ADD CONSTRAINT site_blocks_template_variant_check
  CHECK (template_variant IN ('public', 'mobile'));

-- The constraint was created by Drizzle with a default Postgres name
ALTER TABLE site_blocks DROP CONSTRAINT IF EXISTS site_blocks_community_order_draft_unique;
ALTER TABLE site_blocks DROP CONSTRAINT IF EXISTS site_blocks_community_id_block_order_is_draft_key;

ALTER TABLE site_blocks ADD CONSTRAINT site_blocks_community_order_draft_variant_unique
  UNIQUE (community_id, block_order, is_draft, template_variant);

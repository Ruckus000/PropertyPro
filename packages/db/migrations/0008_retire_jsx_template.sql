-- Migration 0008: retire jsx_template + template_variant
--
-- PR #9e ships the schema piece of the JSX template retirement. The web
-- app no longer renders jsx_template rows (PR #9d) and the editor +
-- admin write paths that produced them are gone (PR #9a-c). This
-- migration completes the lifecycle:
--
--   (a) Hard-delete any remaining site_blocks rows with
--       block_type='jsx_template'. Soft-deleted-but-not-cleaned rows
--       are also deleted here. With the web app's render branch gone
--       in #9d, these rows are invisible to all surfaces; removing
--       them frees the CHECK constraint alter below to succeed.
--   (b) Replace the block_type CHECK constraint to drop jsx_template.
--   (c) Drop the partial unique index that includes template_variant.
--   (d) Drop the template_variant column itself.
--   (e) Recreate the partial unique index without template_variant.
--       Every prod row has template_variant='public' today, so the
--       new index keyed on (community_id, block_order, is_draft)
--       cannot collide with itself.

BEGIN;

-- (a) Hard-delete jsx_template rows. CASCADE not needed — site_blocks
-- has no incoming FKs from other tables.
DELETE FROM site_blocks WHERE block_type = 'jsx_template';

-- (b) Replace the CHECK constraint.
ALTER TABLE site_blocks
  DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE site_blocks
  ADD CONSTRAINT site_blocks_block_type_check
  CHECK (block_type IN (
    'hero', 'text', 'image',
    'documents', 'meetings', 'announcements', 'contact'
  ));

-- (c) Drop the partial unique index that references template_variant.
DROP INDEX IF EXISTS site_blocks_community_order_draft_variant_partial;

-- (d) Drop the template_variant column. NOT NULL DEFAULT 'public' on the
-- column made every prod row carry the same value; the new partial
-- unique index below preserves uniqueness without it.
ALTER TABLE site_blocks DROP COLUMN IF EXISTS template_variant;

-- (e) Recreate the partial unique index keyed on the surviving columns.
CREATE UNIQUE INDEX site_blocks_community_order_draft_partial
  ON site_blocks (community_id, block_order, is_draft)
  WHERE deleted_at IS NULL;

COMMIT;

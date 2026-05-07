-- Add jsx_template block type to site_blocks CHECK constraint
ALTER TABLE site_blocks DROP CONSTRAINT site_blocks_block_type_check;
ALTER TABLE site_blocks ADD CONSTRAINT site_blocks_block_type_check
  CHECK (block_type IN ('hero','announcements','documents','meetings','contact','text','image','jsx_template'));

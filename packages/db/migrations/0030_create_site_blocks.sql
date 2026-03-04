-- Wave 5 / Task 3.1-3.3: Create site_blocks table and add public site columns to communities.

-- Add public site columns to communities
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "custom_domain" text;
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "site_published_at" timestamptz;

-- Create site_blocks table
CREATE TABLE IF NOT EXISTS "site_blocks" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "block_type" text NOT NULL,
  "block_order" integer NOT NULL DEFAULT 0,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- Enable RLS on site_blocks
ALTER TABLE "site_blocks" ENABLE ROW LEVEL SECURITY;

-- Index for efficient block queries by community
CREATE INDEX IF NOT EXISTS "idx_site_blocks_community_order"
  ON "site_blocks" ("community_id", "block_order")
  WHERE "deleted_at" IS NULL;

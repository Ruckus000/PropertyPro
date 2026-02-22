-- P3-50/P3-51: Extend maintenance_requests for Batch D feature set.
-- ALTER TYPE ADD VALUE must run outside a transaction.
-- Drizzle's migrate runner executes each -->statement-breakpoint in autocommit mode.

-- 1. Extend enum (idempotent guards)
DO $$ BEGIN
  ALTER TYPE "public"."maintenance_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'in_progress';
EXCEPTION WHEN duplicate_object THEN null; END $$;
-->statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."maintenance_status" ADD VALUE IF NOT EXISTS 'acknowledged' BEFORE 'in_progress';
EXCEPTION WHEN duplicate_object THEN null; END $$;
-->statement-breakpoint

-- 2. Update column default (new rows → 'submitted')
ALTER TABLE "maintenance_requests"
  ALTER COLUMN "status" SET DEFAULT 'submitted';
-->statement-breakpoint

-- 3. Add new columns
ALTER TABLE "maintenance_requests"
  ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "assigned_to_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "internal_notes" text,
  ADD COLUMN IF NOT EXISTS "resolution_description" text,
  ADD COLUMN IF NOT EXISTS "resolution_date" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "photos" jsonb;
-->statement-breakpoint

-- 4. Create maintenance_comments table (append-only, no updatedAt)
CREATE TABLE IF NOT EXISTS "maintenance_comments" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "community_id" bigint NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "request_id" bigint NOT NULL REFERENCES "public"."maintenance_requests"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE RESTRICT,
  "text" text NOT NULL,
  "is_internal" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
-->statement-breakpoint

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "maintenance_requests_category_idx"
  ON "maintenance_requests" USING btree ("community_id", "category")
  WHERE "deleted_at" IS NULL;
-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_requests_priority_idx"
  ON "maintenance_requests" USING btree ("community_id", "priority")
  WHERE "deleted_at" IS NULL;
-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_requests_created_at_idx"
  ON "maintenance_requests" USING btree ("community_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;
-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_comments_request_idx"
  ON "maintenance_comments" USING btree ("community_id", "request_id");

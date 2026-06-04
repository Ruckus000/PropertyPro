ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "custom_domain_status" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "communities_custom_domain_unique" ON "communities" ("custom_domain") WHERE "custom_domain" IS NOT NULL AND "deleted_at" IS NULL;

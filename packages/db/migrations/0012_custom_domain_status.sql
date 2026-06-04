ALTER TABLE "communities" ADD COLUMN "custom_domain_status" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "custom_domain_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "communities_custom_domain_unique" ON "communities" USING btree ("custom_domain") WHERE custom_domain IS NOT NULL AND deleted_at IS NULL;
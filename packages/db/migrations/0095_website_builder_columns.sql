-- 0095_website_builder_columns
--
-- EXPAND migration: apply BEFORE the code that reads or writes these columns
-- ships. Every column is nullable with no default, so rows written by the old
-- code just leave them NULL and nothing about existing behaviour changes.
--
-- Six columns for the website builder:
--   communities.short_name, office_hours                  the community profile
--   communities.site_live_notice_sent_at, _dismissed_at   the "Email owners" notice
--   compliance_checklist_items.not_applicable_reason      why an item "doesn't apply"
--   compliance_checklist_items.auto_linked_document_id    set by automatic linking
-- and one partial index on compliance_checklist_items.document_id.
--
-- The three CHECKs are added VALID, which scans the table under its lock. They
-- cannot fail: each measures a column this migration creates, every row holds
-- NULL there, and a CHECK passes on NULL.
ALTER TABLE "communities" ADD COLUMN "short_name" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "office_hours" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "site_live_notice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "site_live_notice_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compliance_checklist_items" ADD COLUMN "auto_linked_document_id" bigint;--> statement-breakpoint
ALTER TABLE "compliance_checklist_items" ADD COLUMN "not_applicable_reason" text;--> statement-breakpoint
ALTER TABLE "compliance_checklist_items" ADD CONSTRAINT "compliance_checklist_items_auto_linked_document_id_documents_id_fk" FOREIGN KEY ("auto_linked_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_checklist_items_document_id_idx" ON "compliance_checklist_items" USING btree ("document_id") WHERE "compliance_checklist_items"."document_id" IS NOT NULL AND "compliance_checklist_items"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_short_name_len" CHECK (char_length("communities"."short_name") <= 60);--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_office_hours_len" CHECK (char_length("communities"."office_hours") <= 200);--> statement-breakpoint
ALTER TABLE "compliance_checklist_items" ADD CONSTRAINT "compliance_checklist_items_not_applicable_reason_len" CHECK (char_length("compliance_checklist_items"."not_applicable_reason") BETWEEN 1 AND 200);
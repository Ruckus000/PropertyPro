ALTER TABLE "support_inbox_messages" ADD COLUMN "spf_result" text;--> statement-breakpoint
ALTER TABLE "support_inbox_messages" ADD COLUMN "dkim_result" text;--> statement-breakpoint
ALTER TABLE "support_inbox_messages" ADD COLUMN "dmarc_result" text;--> statement-breakpoint
ALTER TABLE "support_inbox_messages" ADD COLUMN "spam_score" double precision;--> statement-breakpoint
ALTER TABLE "support_inbox_messages" ADD COLUMN "classified_at" timestamp with time zone;
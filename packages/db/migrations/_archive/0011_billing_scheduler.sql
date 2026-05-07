-- P2-34a: Payment alert scheduling columns for subscription degradation.
-- Enables Vercel Cron-based payment reminder emails without Inngest.
-- Partial index makes the hourly cron query cheap — only scans communities
-- with a pending reminder (next_reminder_at IS NOT NULL).
ALTER TABLE "communities" ADD COLUMN "payment_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "next_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "subscription_canceled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "communities_next_reminder_at_idx" ON "communities"
  USING btree ("next_reminder_at") WHERE "next_reminder_at" IS NOT NULL;

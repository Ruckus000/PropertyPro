ALTER TABLE "notification_preferences" ALTER COLUMN "email_frequency" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "email_frequency" SET DEFAULT 'immediate';--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "in_app_enabled" boolean DEFAULT true NOT NULL;
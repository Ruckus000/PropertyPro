CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provisioning_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint,
	"stripe_event_id" text,
	"status" text NOT NULL,
	"last_successful_status" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	CONSTRAINT "provisioning_jobs_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "status_check" CHECK ("provisioning_jobs"."status" IN ('initiated','community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed','failed')),
	CONSTRAINT "last_successful_status_check" CHECK ("provisioning_jobs"."last_successful_status" IS NULL OR "provisioning_jobs"."last_successful_status" IN ('community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed'))
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "subscription_plan" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;
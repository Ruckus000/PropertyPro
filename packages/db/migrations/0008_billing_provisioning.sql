-- Squashed migration: 0008-0011 (billing & provisioning schema)
-- Tables: pending_signups, stripe_webhook_events, provisioning_jobs
-- Additions to: communities (billing columns)

CREATE TABLE "pending_signups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"signup_request_id" text NOT NULL,
	"auth_user_id" uuid,
	"primary_contact_name" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"community_name" text NOT NULL,
	"address" text NOT NULL,
	"county" text NOT NULL,
	"unit_count" integer NOT NULL,
	"community_type" "community_type" NOT NULL,
	"plan_key" text NOT NULL,
	"candidate_slug" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"verification_email_sent_at" timestamp with time zone,
	"verification_email_id" text,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "pending_signups_status_check" CHECK ("pending_signups"."status" IN ('pending_verification','email_verified','checkout_started','payment_completed','provisioning','completed','expired'))
);
--> statement-breakpoint
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
	"signup_request_id" text,
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
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_signup_request_unique" ON "pending_signups" USING btree ("signup_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_email_normalized_unique" ON "pending_signups" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_candidate_slug_active_unique" ON "pending_signups" USING btree ("candidate_slug") WHERE "pending_signups"."status" NOT IN ('expired', 'completed');--> statement-breakpoint
CREATE INDEX "pending_signups_status_idx" ON "pending_signups" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pending_signups_auth_user_id_idx" ON "pending_signups" USING btree ("auth_user_id");--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");

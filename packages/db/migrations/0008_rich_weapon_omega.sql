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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_signup_request_unique" ON "pending_signups" USING btree ("signup_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_email_normalized_unique" ON "pending_signups" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_candidate_slug_unique" ON "pending_signups" USING btree ("candidate_slug");--> statement-breakpoint
CREATE INDEX "pending_signups_status_idx" ON "pending_signups" USING btree ("status","created_at");
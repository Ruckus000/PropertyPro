ALTER TABLE "pending_signups" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD COLUMN "signup_request_id" text;--> statement-breakpoint
CREATE INDEX "pending_signups_auth_user_id_idx" ON "pending_signups" USING btree ("auth_user_id");--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "pending_signups" ADD CONSTRAINT "pending_signups_status_check" CHECK ("pending_signups"."status" IN ('pending_verification','email_verified','checkout_started','payment_completed','provisioning','completed','expired'));
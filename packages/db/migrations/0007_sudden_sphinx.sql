CREATE TYPE "public"."email_frequency" AS ENUM('immediate', 'daily_digest', 'weekly_digest', 'never');--> statement-breakpoint
CREATE TABLE "notification_digest_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"frequency" "email_frequency" NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_title" text NOT NULL,
	"event_summary" text,
	"action_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_frequency" "email_frequency" DEFAULT 'immediate' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_digest_queue" ADD CONSTRAINT "notification_digest_queue_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_queue" ADD CONSTRAINT "notification_digest_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_queue_unique_idempotency" ON "notification_digest_queue" USING btree ("community_id","user_id","frequency","source_type","source_id");--> statement-breakpoint
CREATE INDEX "notification_digest_queue_due_scan_idx" ON "notification_digest_queue" USING btree ("status","next_attempt_at","frequency","community_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_digest_queue_rollup_idx" ON "notification_digest_queue" USING btree ("community_id","user_id","frequency","status","created_at");
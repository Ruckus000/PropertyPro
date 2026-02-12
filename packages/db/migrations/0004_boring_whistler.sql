CREATE TABLE "announcement_delivery_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"announcement_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_delivery_log_unique" UNIQUE("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "demo_seed_registry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"seed_key" text NOT NULL,
	"entity_id" text NOT NULL,
	"community_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_seed_registry_entity_seed_unique" UNIQUE("entity_type","seed_key")
);
--> statement-breakpoint
ALTER TABLE "announcement_delivery_log" ADD CONSTRAINT "announcement_delivery_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_delivery_log" ADD CONSTRAINT "announcement_delivery_log_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_delivery_log" ADD CONSTRAINT "announcement_delivery_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_seed_registry" ADD CONSTRAINT "demo_seed_registry_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_documents_search_vector" ON "documents" USING gin ("search_vector");
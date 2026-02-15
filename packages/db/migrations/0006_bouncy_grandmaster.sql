CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'completed', 'failed', 'not_applicable', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('active', 'expired', 'renewed', 'terminated');--> statement-breakpoint
CREATE TABLE "leases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"resident_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"rent_amount" numeric(10, 2),
	"status" "lease_status" DEFAULT 'active' NOT NULL,
	"previous_lease_id" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_status" "extraction_status" DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_resident_id_users_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_previous_lease_id_fk" FOREIGN KEY ("previous_lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;
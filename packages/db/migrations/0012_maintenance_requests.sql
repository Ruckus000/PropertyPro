-- P2-36: Maintenance requests table for apartment operational dashboard.
-- Minimal schema to power the open-request count metric.
-- Partial index on (community_id, status) WHERE deleted_at IS NULL makes
-- the status = 'open' count query efficient.
CREATE TYPE "public"."maintenance_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "community_id" bigint NOT NULL,
  "unit_id" bigint,
  "submitted_by_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "status" "maintenance_status" DEFAULT 'open' NOT NULL,
  "priority" "maintenance_priority" DEFAULT 'normal' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_community_id_communities_id_fk"
  FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_unit_id_units_id_fk"
  FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_submitted_by_id_users_id_fk"
  FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_requests_community_status_idx"
  ON "maintenance_requests" USING btree ("community_id", "status")
  WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "maintenance_requests_community_id_idx"
  ON "maintenance_requests" USING btree ("community_id");

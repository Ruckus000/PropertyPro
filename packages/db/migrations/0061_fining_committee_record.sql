ALTER TABLE "violation_fines" ADD COLUMN "approved_by_committee" boolean;--> statement-breakpoint
ALTER TABLE "violation_fines" ADD COLUMN "committee_members" jsonb;--> statement-breakpoint
ALTER TABLE "violation_fines" ADD COLUMN "committee_approved_at" timestamp with time zone;

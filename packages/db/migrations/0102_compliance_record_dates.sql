-- Website-compliance audit 2026-11-05, H-2 + H-5. Expand-only: two nullable
-- columns, one FK and one partial index. No default, no backfill.
--
-- documents.received_at: when the association received or created the record.
-- The 30-day posting clock of §718.111(12)(g)1. runs from it. NULL = not
-- recorded; no date is guessed for existing documents.
--
-- meetings.minutes_document_id: which attached document is the meeting's
-- minutes, so per-meeting minutes scoring can read the approval date off it.
-- The app checks the document is in the meeting's community before writing it.
--
-- Locking: fail fast instead of queueing behind a long read. The FK is added
-- NOT VALID (no scan under the strong lock) and validated separately; every
-- value is NULL, so validation is immediate.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "minutes_document_id" bigint;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_minutes_document_id_documents_id_fk" FOREIGN KEY ("minutes_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "meetings" VALIDATE CONSTRAINT "meetings_minutes_document_id_documents_id_fk";--> statement-breakpoint
CREATE INDEX "meetings_minutes_document_id_idx" ON "meetings" USING btree ("minutes_document_id") WHERE "meetings"."minutes_document_id" IS NOT NULL;

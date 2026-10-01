-- Document drafts (website builder v4, Phase 6): `posted_at` NULL = a draft,
-- uploaded but not posted, visible only to managers.
--
-- Expand-only and order-independent of the code: until the code ships, nothing
-- writes NULL, and every reader that does not know the column still sees every
-- row as before.
--
-- Three steps rather than `ADD COLUMN ... DEFAULT now()`: a volatile default on
-- ADD COLUMN stamps EVERY existing row with the migration's own timestamp, which
-- would claim the whole library was posted today. Existing rows were posted when
-- they were created.
ALTER TABLE "documents" ADD COLUMN "posted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "documents" SET "posted_at" = "created_at" WHERE "posted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "posted_at" SET DEFAULT now();

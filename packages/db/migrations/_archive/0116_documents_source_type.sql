-- 0116_documents_source_type.sql
-- Add source_type to documents so hidden violation evidence can stay out of the library.

DO $$
BEGIN
  CREATE TYPE document_source_type AS ENUM ('library', 'violation_evidence');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "source_type" document_source_type NOT NULL DEFAULT 'library';

UPDATE "documents"
SET "source_type" = 'violation_evidence'
WHERE "id" IN (
  SELECT DISTINCT jsonb_array_elements_text(coalesce("evidence_document_ids", '[]'::jsonb))::bigint
  FROM "violations"
);

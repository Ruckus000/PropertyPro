-- A signing request keeps the fields it was SENT with.
--
-- Until now a submission stored only `template_id`, and the public signing
-- route read `template.fields_schema` LIVE on every open. Editing a template
-- therefore changed the document under the people signing it, and two signers
-- on one request could be served different fields. `fields_schema` here is the
-- snapshot taken at send time; the signing and completion paths prefer it and
-- fall back to the template when it is NULL.
--
-- `source_document_path` and the relaxed `template_id` together let a request
-- stand alone: a one-off send uploads a PDF, names who signs it, and needs no
-- template at all.
--
-- SAFETY: Pure EXPAND. Two nullable columns with no default and no backfill,
-- plus one DROP NOT NULL, which only relaxes a constraint. Existing rows are
-- untouched and live code that does not know about any of this keeps working —
-- a NULL `fields_schema` reads exactly as it does today, through the template.
-- Apply to production BEFORE the code that writes them ships.

ALTER TABLE "esign_submissions" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "esign_submissions" ADD COLUMN "fields_schema" jsonb;--> statement-breakpoint
ALTER TABLE "esign_submissions" ADD COLUMN "source_document_path" text;

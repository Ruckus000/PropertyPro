-- Make docuseal_template_id nullable for native templates
ALTER TABLE "public"."esign_templates"
  ALTER COLUMN "docuseal_template_id" DROP NOT NULL;

--> statement-breakpoint

-- Add signing order to submissions (parallel or sequential)
ALTER TABLE "public"."esign_submissions"
  ADD COLUMN IF NOT EXISTS "signing_order" text NOT NULL DEFAULT 'parallel';

--> statement-breakpoint

-- Add document hash for tamper-evident storage
ALTER TABLE "public"."esign_submissions"
  ADD COLUMN IF NOT EXISTS "document_hash" text;

--> statement-breakpoint

-- Add sort_order to signers for sequential signing
ALTER TABLE "public"."esign_signers"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

--> statement-breakpoint

-- Index for fast slug lookup during signing (slug used as signing token)
CREATE INDEX IF NOT EXISTS "idx_esign_signers_slug"
  ON "public"."esign_signers" ("slug") WHERE "deleted_at" IS NULL;

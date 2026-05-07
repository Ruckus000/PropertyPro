-- Reconcile two pieces of schema-vs-prod drift surfaced after the 2026-05-06
-- drizzle re-baseline:
--
--   1. `help_articles` — empty (0 rows) and absent from schema.ts. Drop it
--      from prod so schema.ts is the only source of truth. Confirmed no
--      live code references on origin/main.
--
--   2. `user_search_index` — 70 rows in prod, joined from
--      `packages/db/src/queries/trigram-search.ts` for the command palette's
--      people search. Was lost from schema.ts during the re-baseline because
--      drizzle accesses it through raw SQL only. Add the table back to
--      schema.ts so it appears in the canonical baseline; trigram GIN
--      indexes and the FK to `auth.users` stay raw-SQL-managed because
--      drizzle-orm cannot express them.
--
-- Statements are written to be idempotent so they no-op against prod (where
-- user_search_index already exists with its indexes) and create the full
-- shape on a fresh DB (CI tests, local dev).

-- 1. Drop the vestigial table.
DROP TABLE IF EXISTS "public"."help_articles" CASCADE;
--> statement-breakpoint

-- 2. Recreate user_search_index if missing.
CREATE TABLE IF NOT EXISTS "user_search_index" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"email" text NOT NULL
);
--> statement-breakpoint

-- 3. FK to Supabase auth.users (drizzle cannot express cross-schema FKs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_search_index_user_id_fkey'
      AND conrelid = 'public.user_search_index'::regclass
  ) THEN
    ALTER TABLE "public"."user_search_index"
      ADD CONSTRAINT "user_search_index_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

-- 4. Trigram GIN indexes (require pg_trgm; gin_trgm_ops cannot be expressed
--    via drizzle-orm).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_search_fullname_trgm"
  ON "public"."user_search_index" USING gin ("full_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_search_email_trgm"
  ON "public"."user_search_index" USING gin ("email" gin_trgm_ops);

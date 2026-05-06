-- Migration 0132: Add onboarding checklist items table for activation tracking
CREATE TABLE IF NOT EXISTS "onboarding_checklist_items" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_key" text NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  UNIQUE ("community_id", "user_id", "item_key")
);

-- Index for fast lookup by user within community
CREATE INDEX IF NOT EXISTS "idx_checklist_user_community"
  ON "onboarding_checklist_items" ("user_id", "community_id");

-- RLS: enable and add policies
ALTER TABLE "onboarding_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_checklist_items" FORCE ROW LEVEL SECURITY;

-- Read: users can read their own checklist items within their community
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'onboarding_checklist_items'
      AND policyname = 'checklist_items_select_own'
  ) THEN
    CREATE POLICY "checklist_items_select_own"
      ON "onboarding_checklist_items"
      FOR SELECT
      USING (
        "community_id" = current_setting('app.community_id', true)::bigint
        AND "user_id" = auth.uid()
      );
  END IF;
END
$$;

-- Insert: users can insert their own checklist items within their community
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'onboarding_checklist_items'
      AND policyname = 'checklist_items_insert_own'
  ) THEN
    CREATE POLICY "checklist_items_insert_own"
      ON "onboarding_checklist_items"
      FOR INSERT
      WITH CHECK (
        "community_id" = current_setting('app.community_id', true)::bigint
        AND "user_id" = auth.uid()
      );
  END IF;
END
$$;

-- Update: users can update their own checklist items within their community
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'onboarding_checklist_items'
      AND policyname = 'checklist_items_update_own'
  ) THEN
    CREATE POLICY "checklist_items_update_own"
      ON "onboarding_checklist_items"
      FOR UPDATE
      USING (
        "community_id" = current_setting('app.community_id', true)::bigint
        AND "user_id" = auth.uid()
      );
  END IF;
END
$$;

-- Write-scope trigger: prevent cross-community writes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'enforce_community_scope_onboarding_checklist_items'
      AND tgrelid = 'onboarding_checklist_items'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER "enforce_community_scope_onboarding_checklist_items"
      BEFORE INSERT OR UPDATE ON "onboarding_checklist_items"
      FOR EACH ROW
      EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
  END IF;
END
$$;

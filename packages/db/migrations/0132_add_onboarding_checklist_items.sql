-- Migration 0132: Add onboarding checklist items table for activation tracking
CREATE TABLE IF NOT EXISTS "onboarding_checklist_items" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_key" text NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("community_id", "user_id", "item_key")
);

-- Index for fast lookup by user within community
CREATE INDEX IF NOT EXISTS "idx_checklist_user_community"
  ON "onboarding_checklist_items" ("user_id", "community_id");

-- RLS: enable and add policies
ALTER TABLE "onboarding_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_checklist_items" FORCE ROW LEVEL SECURITY;

-- Read: users can read their own checklist items within their community
CREATE POLICY "checklist_items_select_own"
  ON "onboarding_checklist_items"
  FOR SELECT
  USING (
    "community_id" = current_setting('app.community_id', true)::bigint
    AND "user_id" = auth.uid()
  );

-- Insert: users can insert their own checklist items within their community
CREATE POLICY "checklist_items_insert_own"
  ON "onboarding_checklist_items"
  FOR INSERT
  WITH CHECK (
    "community_id" = current_setting('app.community_id', true)::bigint
    AND "user_id" = auth.uid()
  );

-- Update: users can update their own checklist items within their community
CREATE POLICY "checklist_items_update_own"
  ON "onboarding_checklist_items"
  FOR UPDATE
  USING (
    "community_id" = current_setting('app.community_id', true)::bigint
    AND "user_id" = auth.uid()
  );

-- Write-scope trigger: prevent cross-community writes
CREATE TRIGGER "enforce_community_scope_onboarding_checklist_items"
  BEFORE INSERT OR UPDATE ON "onboarding_checklist_items"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_community_scope();

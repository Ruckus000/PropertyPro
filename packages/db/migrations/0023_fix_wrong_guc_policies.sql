-- 0023_fix_wrong_guc_policies.sql
--
-- Repairs the remaining five baseline policies that read the wrong session
-- GUC `app.community_id`. The canonical tenant GUC is `app.current_community_id`
-- (set by the scoped client / RLS integration harness); nothing in the
-- codebase has ever set `app.community_id`, so these policies were silently
-- non-functional: fail-closed (NULL comparison) for authenticated contexts,
-- and pinned to the non-existent community 0 for anon. Same drift class the
-- 0021 repair fixed for access_requests / community_join_requests.
--
-- Runtime impact: none. Both tables are read/written exclusively through the
-- privileged service-role clients (public-community-reader.ts,
-- onboarding-checklist-service.ts), which bypass RLS — these policies are
-- defense-in-depth for direct anon/authenticated access, and this migration
-- makes that defense functional.
--
-- Also fixes a latent bug: site_blocks_read_published called
-- current_setting() WITHOUT the missing_ok flag, so a direct authenticated
-- query with the GUC unset THREW an error instead of returning zero rows.
-- All five policies now use the robust fail-closed form
--   COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0')::bigint
-- (NULL and empty-string GUC both resolve to community 0, which cannot exist
-- — bigserial ids start at 1).
--
-- Policy names, target roles, and command shapes are preserved verbatim;
-- only the qual/with_check expressions change. site_blocks_service_role is
-- untouched.

-- onboarding_checklist_items ---------------------------------------------------

DROP POLICY IF EXISTS "checklist_items_insert_own" ON "public"."onboarding_checklist_items";
DROP POLICY IF EXISTS "checklist_items_select_own" ON "public"."onboarding_checklist_items";
DROP POLICY IF EXISTS "checklist_items_update_own" ON "public"."onboarding_checklist_items";

CREATE POLICY "checklist_items_insert_own" ON "public"."onboarding_checklist_items"
  FOR INSERT TO public
  WITH CHECK (
    community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
    AND user_id = auth.uid()
  );

CREATE POLICY "checklist_items_select_own" ON "public"."onboarding_checklist_items"
  FOR SELECT TO public
  USING (
    community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
    AND user_id = auth.uid()
  );

CREATE POLICY "checklist_items_update_own" ON "public"."onboarding_checklist_items"
  FOR UPDATE TO public
  USING (
    community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
    AND user_id = auth.uid()
  );

-- site_blocks -------------------------------------------------------------------

DROP POLICY IF EXISTS "site_blocks_anon_read" ON "public"."site_blocks";
DROP POLICY IF EXISTS "site_blocks_read_published" ON "public"."site_blocks";

CREATE POLICY "site_blocks_anon_read" ON "public"."site_blocks"
  FOR SELECT TO anon
  USING (
    is_draft = false
    AND community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
  );

CREATE POLICY "site_blocks_read_published" ON "public"."site_blocks"
  FOR SELECT TO authenticated
  USING (
    is_draft = false
    AND community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
  );

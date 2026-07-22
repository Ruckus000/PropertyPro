-- 0021_fix_access_requests_join_requests_rls.sql
--
-- Repairs RLS drift on access_requests and community_join_requests:
--   1. The baseline policies on both tables read
--      `current_setting('app.community_id', …)` while the rest of the
--      codebase sets `app.current_community_id` (see 0000 GUC definition).
--      The mismatched GUC made every authenticated-context check return
--      NULL (fail-closed). Service-role traffic from the scoped client
--      bypassed RLS entirely, so the bug was silent.
--   2. Neither table has the defense-in-depth write-scope trigger
--      (`pp_rls_enforce_tenant_scope`) that every other tenant_crud table
--      carries, so a forged community_id on INSERT/UPDATE was not rewritten
--      to the active tenant at the DB layer.
--
-- This migration drops the broken stub policies, recreates them using the
-- canonical pp_rls_can_access_community(community_id) helper, and installs
-- the standard pp_rls_enforce_tenant_scope trigger (executing
-- pp_rls_enforce_tenant_community_id) on both tables.

-- access_requests --------------------------------------------------------------

DROP POLICY IF EXISTS "access_requests_tenant_insert" ON "public"."access_requests";
DROP POLICY IF EXISTS "access_requests_tenant_select" ON "public"."access_requests";
DROP POLICY IF EXISTS "access_requests_tenant_update" ON "public"."access_requests";

CREATE POLICY "pp_tenant_select" ON "public"."access_requests"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_insert" ON "public"."access_requests"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_update" ON "public"."access_requests"
  FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
  WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_delete" ON "public"."access_requests"
  FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));

DROP TRIGGER IF EXISTS "enforce_community_scope" ON "public"."access_requests";
DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."access_requests";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public"."access_requests"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

-- community_join_requests ------------------------------------------------------

DROP POLICY IF EXISTS "community_join_requests_tenant_insert" ON "public"."community_join_requests";
DROP POLICY IF EXISTS "community_join_requests_tenant_select" ON "public"."community_join_requests";
DROP POLICY IF EXISTS "community_join_requests_tenant_update" ON "public"."community_join_requests";

CREATE POLICY "pp_tenant_select" ON "public"."community_join_requests"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_insert" ON "public"."community_join_requests"
  FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_update" ON "public"."community_join_requests"
  FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
  WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_delete" ON "public"."community_join_requests"
  FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));

DROP TRIGGER IF EXISTS "enforce_community_scope" ON "public"."community_join_requests";
DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."community_join_requests";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public"."community_join_requests"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

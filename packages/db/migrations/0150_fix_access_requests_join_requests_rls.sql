-- 0150_fix_access_requests_join_requests_rls.sql
--
-- Repairs RLS drift on access_requests and community_join_requests:
--   1. Original migrations (0114, 0137) gated trigger creation on
--      `proname = 'enforce_community_write_scope'` — a function that does
--      not exist in this codebase. The canonical write-scope function is
--      `pp_rls_enforce_tenant_community_id` (defined in 0020). The
--      `IF EXISTS` guard was therefore always false, leaving both tables
--      without a defense-in-depth write-scope trigger.
--   2. Tenant policies on both tables read `current_setting('app.community_id', …)`
--      while the rest of the codebase sets `app.current_community_id`. The
--      mismatched GUC made every authenticated-context check return NULL
--      (fail-closed). Service-role traffic from the scoped client bypassed
--      RLS entirely, so the bug was silent.
--
-- This migration drops the broken stub policies, recreates them using the
-- canonical pp_rls_can_access_community(community_id) helper, and installs
-- the standard `pp_rls_enforce_tenant_scope` trigger on both tables.

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

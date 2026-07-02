-- 0024_canonicalize_onboarding_checklist_trigger.sql
--
-- Brings onboarding_checklist_items into the managed RLS taxonomy by renaming
-- its write-scope trigger to the canonical name pp_rls_enforce_tenant_scope.
--
-- The baseline (0000) installed the trigger under a legacy name
-- (enforce_community_scope_onboarding_checklist_items) executing the SAME
-- function, pp_rls_enforce_tenant_community_id(). Every other tenant-scoped,
-- non-exempt table uses the canonical trigger name; this table is the last
-- naming holdout. The tenant-table coverage guard and the RLS integration
-- test both key off the canonical trigger name, so the table could not be
-- registered in RLS_TENANT_TABLES until this rename landed.
--
-- Runtime impact: NONE. Same trigger function, same BEFORE INSERT OR UPDATE
-- timing, same behavior. The app writes this table through createScopedClient
-- (privileged role), for which pp_rls_enforce_tenant_community_id() returns
-- early via pp_rls_is_privileged() and never enforces — so this trigger is
-- defense-in-depth for direct authenticated writes. Renaming it changes only
-- the trigger's name, not any enforcement.
--
-- Order-independent (pure trigger REPAIR, like 0021/0023): safe to apply
-- before or after the code that registers the table, because no application
-- code depends on the trigger's name.

DROP TRIGGER IF EXISTS "enforce_community_scope_onboarding_checklist_items" ON "public"."onboarding_checklist_items";
DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."onboarding_checklist_items";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "public"."onboarding_checklist_items"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

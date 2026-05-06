-- P4-55b: Harden user_roles RLS INSERT/UPDATE policies.
--
-- Finding: The generic pp_tenant_insert / pp_tenant_update policies installed on
-- user_roles by migration 0020 only require community membership (any role, including
-- 'tenant'). This permits privilege escalation: any authenticated community member
-- could INSERT a user_roles row with role='board_president'.
--
-- Fix: Replace with specialized policies requiring admin-tier role via
-- pp_rls_can_read_audit_log() (board_member, board_president, cam, site_manager,
-- property_manager_admin). SELECT and DELETE remain on the standard community
-- membership check (pp_rls_can_access_community).
--
-- Recursion safety: pp_rls_has_community_membership() called by
-- pp_rls_can_access_community() is SECURITY DEFINER — its SELECT on user_roles
-- bypasses RLS, so no infinite recursion can occur.

DROP POLICY IF EXISTS "pp_tenant_insert" ON "public"."user_roles";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."user_roles";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_user_roles_insert" ON "public"."user_roles";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_user_roles_update" ON "public"."user_roles";
--> statement-breakpoint

CREATE POLICY "pp_user_roles_insert"
ON "public"."user_roles"
FOR INSERT
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));
--> statement-breakpoint

CREATE POLICY "pp_user_roles_update"
ON "public"."user_roles"
FOR UPDATE
USING ("public"."pp_rls_can_read_audit_log"("community_id"))
WITH CHECK ("public"."pp_rls_can_read_audit_log"("community_id"));

-- Rollback (manual):
-- DROP POLICY IF EXISTS "pp_user_roles_insert" ON "public"."user_roles";
-- DROP POLICY IF EXISTS "pp_user_roles_update" ON "public"."user_roles";
-- CREATE POLICY "pp_tenant_insert" ON "public"."user_roles"
--   FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_update" ON "public"."user_roles"
--   FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
--   WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));

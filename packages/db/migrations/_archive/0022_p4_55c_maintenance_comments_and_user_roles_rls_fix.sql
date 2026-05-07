-- P4-55c: Targeted RLS hardening fixes from Gemini PR#14 review.
--
-- Fix A (maintenance_comments — CRITICAL): The generic tenant CRUD loop in 0020
-- applied UPDATE and DELETE policies to maintenance_comments. The application layer
-- already blocks these operations via scoped-client APPEND_ONLY_TABLES, but RLS
-- should enforce the same invariant as defense-in-depth. Drop UPDATE/DELETE policies
-- so the DB itself rejects any such attempt, regardless of client.
--
-- Fix B (user_roles DELETE — HIGH): Migration 0021 hardened INSERT/UPDATE on
-- user_roles to require admin-tier role but left the generic pp_tenant_delete
-- (community membership only) in place. Any authenticated community member (including
-- the 'tenant' role) could DELETE any role assignment, enabling unauthorized access
-- disruption. Replace with admin-tier check via pp_rls_can_read_audit_log(), consistent
-- with INSERT and UPDATE.
--
-- Note on trigger medium finding (non-actionable): pp_rls_enforce_tenant_community_id
-- raises if app.current_community_id is unset for non-privileged writes. All application
-- writes go through createScopedClient(), which calls set_config('app.current_community_id',
-- ...) before every INSERT/UPDATE. No direct PostgREST client writes are used. The strict
-- trigger behavior is intentional and correct for this architecture.

-- Fix A: maintenance_comments — drop UPDATE and DELETE policies (append-only enforcement)
DROP POLICY IF EXISTS "pp_tenant_update" ON "public"."maintenance_comments";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."maintenance_comments";
--> statement-breakpoint

-- Fix B: user_roles DELETE — drop generic community-membership delete, add admin-tier delete
DROP POLICY IF EXISTS "pp_tenant_delete" ON "public"."user_roles";
--> statement-breakpoint
DROP POLICY IF EXISTS "pp_user_roles_delete" ON "public"."user_roles";
--> statement-breakpoint

CREATE POLICY "pp_user_roles_delete"
ON "public"."user_roles"
FOR DELETE
USING ("public"."pp_rls_can_read_audit_log"("community_id"));

-- Rollback (manual):
-- DROP POLICY IF EXISTS "pp_user_roles_delete" ON "public"."user_roles";
-- CREATE POLICY "pp_tenant_delete" ON "public"."user_roles"
--   FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_update" ON "public"."maintenance_comments"
--   FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"))
--   WITH CHECK ("public"."pp_rls_can_access_community"("community_id"));
-- CREATE POLICY "pp_tenant_delete" ON "public"."maintenance_comments"
--   FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));

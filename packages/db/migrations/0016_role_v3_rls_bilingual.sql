-- v3 role transition (Phase 1 bilingual window): widen the admin-tier RLS gate
-- so rows with the new v3 roles pass the same SECURITY DEFINER check as v2
-- manager/pm_admin rows. This function gates INSERT/UPDATE/DELETE policies on
-- the tenant_admin_write table class, not just audit-log reads. Verbatim from
-- 0000_nappy_guardian.sql except the role IN list. Spec:
-- docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
CREATE OR REPLACE FUNCTION public.pp_rls_can_read_audit_log(target_community_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
        AND ur.role IN ('manager', 'pm_admin', 'property_manager', 'root_manager')
    )
  END;
$function$;

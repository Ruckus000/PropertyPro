-- Migration 0094: Role Simplification — Update RLS functions for new role enum
-- After 0093 column swap, `role` column contains user_role_v2 values.
-- All admin-gated RLS functions now check for 'manager' and 'pm_admin'.

CREATE OR REPLACE FUNCTION "public"."pp_rls_can_read_audit_log"(target_community_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
        AND ur.role IN ('manager', 'pm_admin')
    )
  END;
$$;

-- Fix: remove stale ur.deleted_at IS NULL from pp_rls_can_read_audit_log.
-- The user_roles table has never had a deleted_at column; this reference
-- was a copy-paste error from migration 0020. Migration 0025 fixed the
-- same issue in pp_rls_has_community_membership but missed this function.

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
        AND ur.role IN (
          'board_member',
          'board_president',
          'cam',
          'site_manager',
          'property_manager_admin'
        )
    )
  END;
$$;

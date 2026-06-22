-- 0020_role_v3_cleanup.sql  (role-v3 Phase 4.1)
-- Retires the legacy manager/pm_admin (and stray super_admin) enum values, drops the
-- dead permissions/preset_key/legacy_role columns + manager-keyed CHECK constraints, and
-- narrows the audit RLS function + the two storage site-asset policies to the v3 PM tier.
-- Applied MANUALLY to prod via Supabase MCP AFTER the code is live (see PR #742).

-- (1) Defensive backfill: any straggler manager/pm_admin → property_manager.
--     (Pre-flight already cascade-deleted the p2-43-* test communities to 0 legacy rows;
--      this catches a row created between pre-flight and apply.)
UPDATE public.user_roles SET role = 'property_manager' WHERE role IN ('manager','pm_admin');

-- (2) Drop manager/preset-keyed CHECK constraints (they reference the dropped columns and/or
--     the manager value). chk_owner_flag_resident_only references 'resident'::user_role_v2
--     (hard type-dep) → drop here, recreate after the type swap.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_manager_has_permissions;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_non_manager_no_permissions;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_preset_key_manager_only;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_owner_flag_resident_only;

-- (3) Drop the storage site-asset policies BEFORE dropping preset_key + the enum type:
--     the current policies reference BOTH preset_key (the `manager AND preset_key='cam'` arm)
--     and user_role_v2 (explicit ::user_role_v2 casts), so they must go first. The storage
--     schema only exists on Supabase; skip in non-Supabase environments (CI integration DB) —
--     same guard pattern as migrations 0006/0017.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema not present (non-Supabase environment); skipping storage-policy drop in 0020';
    RETURN;
  END IF;
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_insert" ON storage.objects$POL$;
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_delete" ON storage.objects$POL$;
END $$;

-- (4) Drop the dead columns.
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS permissions;
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS preset_key;
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS legacy_role;

-- (5) Drop the remaining type hard-dependent (partial index references 'root_manager').
DROP INDEX IF EXISTS public.user_roles_one_root_per_community;

-- (6) Rebuild the enum to the 3 end-state values (removes manager, pm_admin, super_admin).
CREATE TYPE public.user_role_v2_new AS ENUM ('resident','property_manager','root_manager');
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.user_role_v2_new USING role::text::public.user_role_v2_new;
DROP TYPE public.user_role_v2;
ALTER TYPE public.user_role_v2_new RENAME TO user_role_v2;

-- (7) Recreate the public-schema dependents against the new type.
CREATE UNIQUE INDEX user_roles_one_root_per_community
  ON public.user_roles (community_id) WHERE role = 'root_manager';
ALTER TABLE public.user_roles
  ADD CONSTRAINT chk_owner_flag_resident_only
  CHECK (role = 'resident' OR is_unit_owner = false);

-- (8) Recreate the storage site-asset policies narrowed to the v3 PM-tier roles
--     (drops the pm_admin + manager+cam-preset arms). Guarded as in (3).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema not present (non-Supabase environment); skipping storage-policy create in 0020';
    RETURN;
  END IF;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND role IN ('property_manager', 'root_manager')
        )
      )
  $POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND role IN ('property_manager', 'root_manager')
        )
      )
  $POL$;
END $$;

-- (9) Narrow the audit RLS function (public schema; exists in all environments).
CREATE OR REPLACE FUNCTION public.pp_rls_can_read_audit_log(target_community_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog' AS $function$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (SELECT 1 FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid() AND ur.community_id = target_community_id
        AND ur.role IN ('property_manager','root_manager'))
  END;
$function$;

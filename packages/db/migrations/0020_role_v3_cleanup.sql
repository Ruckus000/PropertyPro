-- 0020_role_v3_cleanup.sql  (role-v3 Phase 4.1)
UPDATE public.user_roles SET role = 'property_manager' WHERE role IN ('manager','pm_admin');

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_manager_has_permissions;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_non_manager_no_permissions;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_preset_key_manager_only;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS chk_owner_flag_resident_only;

ALTER TABLE public.user_roles DROP COLUMN IF EXISTS permissions;
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS preset_key;
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS legacy_role;

DROP INDEX IF EXISTS public.user_roles_one_root_per_community;
DROP POLICY IF EXISTS site_assets_pm_insert ON storage.objects;
DROP POLICY IF EXISTS site_assets_pm_delete ON storage.objects;

CREATE TYPE public.user_role_v2_new AS ENUM ('resident','property_manager','root_manager');
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.user_role_v2_new USING role::text::public.user_role_v2_new;
DROP TYPE public.user_role_v2;
ALTER TYPE public.user_role_v2_new RENAME TO user_role_v2;

CREATE UNIQUE INDEX user_roles_one_root_per_community
  ON public.user_roles (community_id) WHERE role = 'root_manager';
ALTER TABLE public.user_roles
  ADD CONSTRAINT chk_owner_flag_resident_only
  CHECK (role = 'resident' OR is_unit_owner = false);

CREATE POLICY site_assets_pm_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-site-assets' AND (storage.foldername(name))[1] IN (
    SELECT community_id::text FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('property_manager','root_manager')));
CREATE POLICY site_assets_pm_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community-site-assets' AND (storage.foldername(name))[1] IN (
    SELECT community_id::text FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('property_manager','root_manager')));

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

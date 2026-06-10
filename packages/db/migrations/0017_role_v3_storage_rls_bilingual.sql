-- v3 role transition (Phase 2 prerequisite): widen the two community-site-assets
-- storage.objects policies so backfilled v3 roles retain bucket access. Verbatim
-- from 0006_site_assets_storage.sql except the role predicate. Spec audit Finding 5.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not present (non-Supabase environment); skipping migration 0017';
    RETURN;
  END IF;

  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_insert" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND (
               role IN ('pm_admin', 'property_manager', 'root_manager')
               OR (role = 'manager' AND preset_key = 'cam')
             )
        )
      )
  $POL$;

  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_delete" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND (
               role IN ('pm_admin', 'property_manager', 'root_manager')
               OR (role = 'manager' AND preset_key = 'cam')
             )
        )
      )
  $POL$;
END $$;

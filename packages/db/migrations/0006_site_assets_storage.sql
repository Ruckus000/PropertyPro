-- Migration 0006: site assets storage bucket + RLS policies
--
-- Creates the community-site-assets storage bucket (public = true so anonymous
-- reads work) and four RLS policies governing object access. PM users
-- (role='pm_admin', or role='manager' with the 'cam' preset) get insert +
-- delete on objects under their community's path prefix; service_role gets
-- full access for the finalize endpoint to read raw uploads + write WebP
-- variants without inheriting end-user auth.
--
-- Bucket path convention: {community_id}/{kind}/{uuid}-{filename}
-- where kind ∈ {logo, hero, content}.
--
-- NOTE: This migration's PM policies were originally written against a
-- non-existent `community_memberships` table with non-existent columns/enum
-- values, so the entire DO block aborted on any real Supabase environment
-- (CI passed only because the to_regclass guard skipped the body on
-- bare-Postgres). The corrected subqueries below match the current
-- `public.user_roles` schema (see packages/db/src/schema/user-roles.ts and
-- migration 0093 which collapsed the role enum to user_role_v2).

BEGIN;

-- Supabase Storage tables (storage.buckets / storage.objects) live in the
-- `storage` schema, which only exists in environments running the Supabase
-- platform (local Supabase, hosted Supabase, supabase-db image). Bare-Postgres
-- environments used by integration-tests CI don't have it. Skip the entire
-- migration body in that case — the application code that uses these objects
-- never runs in those environments either.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not present (non-Supabase environment); skipping migration 0006';
    RETURN;
  END IF;

  -- Create the bucket (idempotent — INSERT ... ON CONFLICT DO NOTHING)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'community-site-assets',
    'community-site-assets',
    true,
    10485760,  -- 10 MB hard cap at the bucket layer; per-block tighter limits enforced in the API
    ARRAY['image/jpeg','image/png','image/webp']
  )
  ON CONFLICT (id) DO NOTHING;

  -- Service-role: full access (the finalize endpoint runs as service_role to
  -- read raw uploads + write transformed variants)
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_service_role_all" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_service_role_all" ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'community-site-assets')
      WITH CHECK (bucket_id = 'community-site-assets')
  $POL$;

  -- Authenticated PM can INSERT objects in their own community's path prefix.
  -- Matches the runtime gate in /api/v1/pm/site/hero (requireRole [pm_admin, cam]):
  --   role='pm_admin', OR role='manager' with preset_key='cam'.
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_insert" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND (role = 'pm_admin' OR (role = 'manager' AND preset_key = 'cam'))
        )
      )
  $POL$;

  -- Anonymous + authenticated public read (the public site is unauthenticated)
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_public_read" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_public_read" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'community-site-assets')
  $POL$;

  -- Authenticated PM can DELETE objects in their own community's path prefix.
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_delete" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND (role = 'pm_admin' OR (role = 'manager' AND preset_key = 'cam'))
        )
      )
  $POL$;
END $$;

COMMIT;

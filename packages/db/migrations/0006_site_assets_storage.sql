-- Migration 0006: site assets storage bucket + RLS policies
--
-- Creates the community-site-assets storage bucket (public = true so anonymous
-- reads work) and four RLS policies governing object access. PM users in
-- pm_admin / cam / property_manager_admin roles get insert + delete on objects
-- under their community's path prefix; service_role gets full access for the
-- finalize endpoint to read raw uploads + write WebP variants without
-- inheriting end-user auth.
--
-- Bucket path convention: {community_id}/{kind}/{uuid}-{filename}
-- where kind ∈ {logo, hero, content}.

BEGIN;

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
DROP POLICY IF EXISTS "site_assets_service_role_all" ON storage.objects;
CREATE POLICY "site_assets_service_role_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'community-site-assets')
  WITH CHECK (bucket_id = 'community-site-assets');

-- Authenticated PM can INSERT objects in their own community's path prefix.
DROP POLICY IF EXISTS "site_assets_pm_insert" ON storage.objects;
CREATE POLICY "site_assets_pm_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-site-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT community_id::text FROM community_memberships
       WHERE user_id = auth.uid()
         AND role_id IN ('property_manager_admin','cam','pm_admin')
         AND deleted_at IS NULL
    )
  );

-- Anonymous + authenticated public read (the public site is unauthenticated)
DROP POLICY IF EXISTS "site_assets_public_read" ON storage.objects;
CREATE POLICY "site_assets_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-site-assets');

-- Authenticated PM can DELETE objects in their own community's path prefix.
DROP POLICY IF EXISTS "site_assets_pm_delete" ON storage.objects;
CREATE POLICY "site_assets_pm_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-site-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT community_id::text FROM community_memberships
       WHERE user_id = auth.uid()
         AND role_id IN ('property_manager_admin','cam','pm_admin')
         AND deleted_at IS NULL
    )
  );

COMMIT;

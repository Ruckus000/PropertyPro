-- Drop the broad storage SELECT policy that let anyone enumerate every uploaded
-- site asset across every community.
--
-- Last open item from the Supabase advisor triage. 0039_pin_function_search_path
-- closed the search_path class and the CREATE-on-public grant behind it, and
-- documented why the four "SECURITY DEFINER executable by anon" lints must be
-- left alone. This closes advisor lint 0025, public_bucket_allows_listing —
-- the only remaining finding that is real exposure rather than an artifact of
-- how this app uses Postgres.
--
-- ===========================================================================
-- WHAT WAS EXPOSED
-- ===========================================================================
--
-- site_assets_public_read (0006_site_assets_storage.sql:75) granted:
--
--   FOR SELECT TO anon, authenticated USING (bucket_id = 'community-site-assets')
--
-- A SELECT policy on storage.objects is what authorises LISTING a bucket. With
-- no path predicate, any visitor — signed in or not — could enumerate the object
-- rows for every community's uploads, not merely the community whose site they
-- were looking at. Object paths are `<community_id>/<filename>`, so the listing
-- discloses which communities have assets and what their files are named. The
-- image bytes were already public by design; the cross-tenant INVENTORY was not.
--
-- ===========================================================================
-- WHY DROPPING IT DOES NOT BREAK PUBLIC READS
-- ===========================================================================
--
-- The bucket is `public = true` (0006:37-45). Supabase serves public buckets over
-- /storage/v1/object/public/<bucket>/<path>, a route that does NOT evaluate
-- storage.objects RLS — that is the entire meaning of a public bucket. The
-- policy was therefore never what made the images load.
--
-- Every anon-facing read in this repo goes through that CDN route and never the
-- storage SDK: buildPublicAssetUrl (apps/web/src/lib/site-assets/public-url.ts:13),
-- consumed by HeroBlock, ImageBlock, GalleryBlock and the PM GalleryBlockForm.
-- There is no `.storage.from('community-site-assets')` call anywhere in client
-- or anon-reachable code.
--
-- The one `.list()` against this bucket (apps/web/src/lib/site-assets/cleanup.ts:43,
-- called from account-lifecycle-service.ts) runs through createAdminClient() as
-- service_role, which keeps full access via site_assets_service_role_all and
-- bypasses RLS regardless. Uploads (site_assets_pm_insert) and deletes
-- (site_assets_pm_delete) are untouched — both are already community-scoped by
-- path prefix.
--
-- Blast radius at time of writing: the bucket holds ZERO objects, so nothing is
-- currently enumerable. That is the argument for doing this now rather than
-- after the first real upload lands.
--
-- ===========================================================================
--
-- If a genuine anon SDK read surfaces later, the correct replacement is a
-- path-scoped SELECT policy, not this one — restrict on
-- (storage.foldername(name))[1] the way site_assets_pm_delete does, so a caller
-- can only list the community they are actually viewing.
--
-- Idempotent: DROP POLICY IF EXISTS. Guarded on storage.buckets like 0006, so
-- bare-Postgres CI (which has no storage schema) skips it rather than failing.
-- Order-independent pure hardening — no expand/contract concern.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not present (non-Supabase environment); skipping migration 0040';
    RETURN;
  END IF;

  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_public_read" ON storage.objects$POL$;
END $$;

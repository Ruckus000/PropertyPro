-- 0066_provision_maintenance_and_community_assets_buckets
--
-- WHY: two buckets the shipped code writes to have never existed in production.
-- Verified against prod on 2026-09-04 — storage.buckets held exactly three rows
-- (documents, community-site-assets, community-exports). `maintenance`
-- (apps/web/src/lib/services/photo-processor.ts) and `community-assets`
-- (apps/admin/src/app/api/admin/upload/route.ts) were absent, so every
-- maintenance-photo upload 500'd on createSignedUploadUrl and every admin image
-- upload 500'd on .upload(), both with Supabase's verbatim `Bucket not found`.
--
-- Corroborated by the data rather than inferred: 9 maintenance_requests rows,
-- 0 with a non-empty photos array; 0 `file_uploaded` rows in
-- platform_admin_audit_log, which that route writes on every success. Nobody
-- reported it because nobody has ever completed either upload.
--
-- This is the THIRD occurrence of "bucket referenced but never provisioned"
-- (0049 fixed `documents`). Unlike 0049 there is no hand-made prod bucket to
-- mirror, so the shapes below are derived from how the code actually uses each
-- bucket rather than copied from a live one.
--
-- WHY BOTH GET ZERO storage.objects POLICIES — two different reasons that look
-- identical in the diff, which is why they are written down:
--
--   * `maintenance` is PRIVATE, and storage.objects is default-deny. A
--     policy-less private bucket is therefore UNREACHABLE by anon/authenticated;
--     every read is a service-role signed URL. Adding a permissive policy would
--     widen access, not protect it. Same model as 0049 / 0059.
--
--   * `community-assets` is PUBLIC, and /storage/v1/object/public/... does NOT
--     evaluate storage.objects RLS at all — that is what "public" means, and
--     getPublicUrl() produces exactly that URL. A SELECT policy here would not
--     gate reads; it would authorise LISTING, i.e. a cross-tenant inventory of
--     every community's uploads. Migration 0041 DROPPED precisely such a policy
--     from community-site-assets for that reason (Supabase advisor lint 0025,
--     public_bucket_allows_listing). Do NOT "fix" this by adding one. If an
--     anon SDK read is ever genuinely needed, add a PATH-SCOPED policy the way
--     site_assets_pm_delete scopes on (storage.foldername(name))[1].
--
-- SAFETY: pure EXPAND. It only creates objects the already-shipped code assumes,
-- so it is order-independent with respect to code deploys — and should be
-- applied FIRST, because doing so un-breaks production immediately. No new
-- tenant table, so RLS_EXPECTED_TENANT_TABLE_COUNT is unchanged.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING, inside a DO block that returns early
-- where the `storage` schema is absent (the local bare-Postgres test database).
-- If either bucket is hand-created before this runs, its settings are left
-- alone rather than clobbered.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not present (non-Supabase environment); skipping migration 0066';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'maintenance',
    'maintenance',
    false,     -- private: every read is a service-role signed URL, and the
               -- contents are resident photographs of private property
    10485760,  -- 10 MB. api/v1/maintenance-requests validates a CLIENT-DECLARED
               -- fileSize and then discards it — the presign carries no size
               -- constraint — so this cap is what makes that declared limit true
               -- against a client that lies. It cannot reject an honest one.
    NULL       -- no MIME allowlist, DELIBERATELY, and unlike community-assets
               -- below. The only Content-Type reaching storage here is the
               -- browser's File.type on a PUT whose response SubmitForm.tsx does
               -- NOT check, so a bucket-level rejection would leave a maintenance
               -- request pointing at an object that does not exist — a silent
               -- phantom photo. `documents` (0049) carries NULL for the same
               -- reason. Real upload-time MIME enforcement belongs in the presign
               -- route, which today accepts mimeType as a bare z.string().
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'community-assets',
    'community-assets',
    true,      -- public: the upload route returns getPublicUrl(...) and the
               -- result is rendered to unauthenticated site visitors
    5242880,   -- 5 MB, mirroring MAX_FILE_SIZE, which is already enforced
               -- server-side against the real bytes — defence in depth, not the
               -- only enforcement
    ARRAY['image/jpeg','image/png','image/webp']
               -- exactly the set detectMimeFromBuffer can return, and the route
               -- passes contentType: detectedMime, so this can never reject a
               -- legitimate upload. It is the second line of defence on the SVG
               -- stored-XSS hole (2026-08-05 admin-portal hardening audit): SVG
               -- served from a public bucket executes on the bucket origin, and
               -- with this allowlist, re-adding image/svg+xml to the route's own
               -- list is no longer sufficient to reintroduce it.
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

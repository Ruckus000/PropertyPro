-- 0049_documents_storage_bucket
--
-- WHY: the `documents` storage bucket had no provisioning path anywhere in this
-- repo — no migration created it, and neither did the seed. Production has it
-- only because someone made it by hand, long ago. The consequence was that a
-- fresh local Supabase stack could not run `pnpm seed:demo` at all: it aborted
-- on the first document with Supabase's verbatim `Bucket not found`, and the
-- prerequisite existed only in an audit note
-- (docs/audits/2026-08-03-e2e-inventory.md), which is a prerequisite nobody
-- finds. PR #893 patched that imperatively from the seed; this migration moves
-- it to the layer the sibling bucket already uses (0006 does exactly this for
-- `community-site-assets`), so the bucket also exists for anyone who runs
-- `db:migrate` without ever seeding, and so no best-effort side effect has to
-- live on the `POST /api/admin/demos` request path.
--
-- Deliberately NO RLS policies on storage.objects, unlike 0006. That is not an
-- oversight and not a gap: `community-site-assets` is `public = true` and is
-- read directly by unauthenticated site visitors, so it needs policies to be
-- reachable at all. Every access to `documents` goes through the service-role
-- admin client (packages/db/src/supabase/admin.ts), which bypasses storage RLS,
-- and end users receive time-limited signed URLs rather than reading storage
-- directly. storage.objects is default-deny, so a policy-less private bucket is
-- INACCESSIBLE to anon/authenticated rather than over-exposed. Adding
-- permissive policies here would widen access, not protect it.
--
-- Bucket shape mirrors what production already has and what #893 created:
-- private, no size cap, no MIME allowlist. Do not tighten it here. The seed
-- writes PDFs and apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts
-- writes images to the same bucket, so a local bucket TIGHTER than the real one
-- fails in ways no real environment does — which is the failure mode worth
-- engineering against.
--
-- SAFETY: pure EXPAND, and a literal no-op against production, where the bucket
-- already exists (ON CONFLICT DO NOTHING). Order-independent: it adds an object
-- that existing code already assumes, so it can be applied before or after the
-- code that removes the imperative fallback. No new tenant table, so
-- RLS_EXPECTED_TENANT_TABLE_COUNT is unchanged.
--
-- Idempotent: INSERT ... ON CONFLICT (id) DO NOTHING, inside a DO block that
-- returns early where the `storage` schema does not exist.

DO $$
BEGIN
  -- Supabase Storage tables live in the `storage` schema, which only exists in
  -- environments running the Supabase platform. The bare Postgres used by
  -- integration-tests CI has no such schema; skip the body there, exactly as
  -- migration 0006 does. The application code that touches this bucket never
  -- runs in those environments either.
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not present (non-Supabase environment); skipping migration 0049';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'documents',
    'documents',
    false,  -- private: reads are served as signed URLs, never direct storage reads
    NULL,   -- no bucket-level size cap; the API enforces per-upload limits
    NULL    -- no MIME allowlist; this bucket holds both PDFs and draft images
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

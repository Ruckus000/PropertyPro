-- 0059_community_exports_bucket
--
-- WHY: the async community-export worker writes generated ZIP volumes to a
-- dedicated `community-exports` bucket. Provisioned here rather than
-- imperatively at runtime, for the same reason 0049 moved the `documents`
-- bucket into a migration: a bucket that exists only because someone made it by
-- hand is a prerequisite nobody finds, and it fails at request time with
-- Supabase's verbatim `Bucket not found`.
--
-- WHY NOT REUSE `documents`: an export object is a copy of an ENTIRE
-- association — every table plus every uploaded file, including resident PII. A
-- signed-URL or policy mistake there is categorically worse than the same
-- mistake on one document. Separate bucket keeps the blast radius separate, and
-- the retention differs (exports expire after 14 days; documents are permanent).
-- See docs/audits/2026-08-09-legal-risk-audit.md F-07.
--
-- Deliberately NO RLS policies on storage.objects, matching 0049. That is not an
-- oversight: storage.objects is default-deny, so a policy-less PRIVATE bucket is
-- INACCESSIBLE to anon/authenticated rather than over-exposed. Every read goes
-- through the service-role admin client minting a short-lived signed URL (900s
-- here, deliberately shorter than the 3600s used for a single document). Adding
-- permissive policies would widen access, not protect it.
--
-- SAFETY: pure EXPAND, and a no-op where the bucket already exists
-- (ON CONFLICT DO NOTHING). Order-independent — apply before or after the code.
-- No new tenant table, so RLS_EXPECTED_TENANT_TABLE_COUNT is unchanged by THIS
-- migration (0058 bumped it 80 → 82).
--
-- Idempotent: INSERT ... ON CONFLICT (id) DO NOTHING inside a DO block that
-- returns early where the `storage` schema does not exist.

DO $$
BEGIN
  -- Supabase Storage tables live in the `storage` schema, which only exists in
  -- environments running the Supabase platform. The bare Postgres used by
  -- integration-tests CI has no such schema; skip the body there, exactly as
  -- migrations 0006 and 0049 do. The worker never runs in those environments.
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not present (non-Supabase environment); skipping migration 0059';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'community-exports',
    'community-exports',
    false,  -- private: reads are short-lived signed URLs, never direct
    NULL,   -- no bucket-level cap; the worker bounds each volume itself
    NULL    -- single writer, always application/zip; an allowlist adds no safety
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

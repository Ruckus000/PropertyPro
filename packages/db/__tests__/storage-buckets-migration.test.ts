import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_ASSETS_BUCKET,
  MAINTENANCE_BUCKET,
} from '../src/constants/storage-buckets';

/**
 * Static guards on migration 0066 (provision the `maintenance` and
 * `community-assets` buckets).
 *
 * Why the assertions read migration TEXT rather than a live database: the
 * sibling `supabase-storage.integration.test.ts` is `describe.skip`ped whenever
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent, which is the
 * case in the CI unit job. A DB-backed assertion would therefore prove nothing
 * on a PR. Reading the SQL runs everywhere.
 *
 * What is being defended, in order of how badly it would fail:
 *
 *  1. `community-assets` is PUBLIC and must have NO storage.objects policy.
 *     A public bucket serves bytes over /object/public/..., a route that does
 *     not evaluate RLS at all — so a SELECT policy does not gate reads, it
 *     authorises LISTING, which is a cross-tenant inventory leak. Migration
 *     0041 DROPPED exactly such a policy from community-site-assets for that
 *     reason (Supabase advisor lint 0025, public_bucket_allows_listing). The
 *     intuitive "public bucket needs a public-read policy" is the bug.
 *  2. `community-assets` must not allowlist image/svg+xml. SVG stored in a
 *     public bucket executes on the bucket origin — the stored-XSS hole from
 *     the 2026-08-05 admin-portal hardening audit. The route's own allowlist is
 *     the first line of defence; this is the second, and it is the one an
 *     editor of the route cannot accidentally remove.
 *  3. `maintenance` must be PRIVATE. Every read is a service-role signed URL,
 *     and the contents are resident-submitted photographs of private property.
 */

const RAW = readFileSync(
  path.resolve(
    __dirname,
    '../migrations/0066_provision_maintenance_and_community_assets_buckets.sql',
  ),
  'utf8',
);

/**
 * The SQL with `--` comments stripped.
 *
 * Every assertion below runs against this, not the raw text, because the file's
 * comments discuss the very things being asserted — they name `image/svg+xml`
 * to explain why it is excluded, and `ON CONFLICT (id) DO NOTHING` to explain
 * idempotency. Matching prose would let a comment satisfy an assertion the SQL
 * does not, which is the definition of a vacuous test. It cuts both ways: the
 * first run of this file failed on its own explanatory comments.
 */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');

/**
 * One bucket's INSERT statement, so a per-bucket claim cannot be satisfied by
 * the other bucket's tuple.
 *
 * Split on the statement keyword, NOT on `ON CONFLICT`. An earlier version used
 * the latter as the end boundary, which coupled every community-assets
 * assertion to the idempotency clause: the probe that deleted one `ON CONFLICT`
 * reddened four tests instead of one, because it broke the slicing rather than
 * the claim. A test whose subject moves when an unrelated line changes is not
 * testing what it says it is.
 */
function insertFor(bucketId: string): string {
  const statements = MIGRATION.split(/INSERT INTO storage\.buckets/);
  const match = statements.filter((s) => s.includes(`'${bucketId}',`));
  expect(match, `expected exactly one INSERT for bucket "${bucketId}"`).toHaveLength(1);
  return match[0]!;
}

describe('0066 storage bucket provisioning migration', () => {
  it('creates the maintenance bucket as PRIVATE', () => {
    // Resident photographs of private property; every read is a service-role
    // signed URL. There is no getPublicUrl call anywhere on this path.
    expect(insertFor('maintenance')).toMatch(/\bfalse\b/);
  });

  it('creates the community-assets bucket as PUBLIC', () => {
    // The admin upload route returns getPublicUrl(...) to the browser, and the
    // resulting URL is rendered to unauthenticated site visitors. A private
    // bucket would break every consumer.
    expect(insertFor('community-assets')).toMatch(/\btrue\b/);
  });

  it('caps each bucket at the size its route already declares', () => {
    // maintenance: 10 MB — maintenance-requests/route.ts validates a
    // CLIENT-DECLARED fileSize and then discards it, so the bucket cap is what
    // makes that declared limit true against a client that lies.
    expect(insertFor('maintenance')).toContain('10485760');
    // community-assets: 5 MB — mirrors MAX_FILE_SIZE, already enforced on the
    // real bytes, so this is defence in depth rather than sole enforcement.
    expect(insertFor('community-assets')).toContain('5242880');
  });

  it('allowlists exactly jpeg/png/webp on community-assets, and never svg', () => {
    const tuple = insertFor('community-assets');
    expect(tuple).toContain("'image/jpeg'");
    expect(tuple).toContain("'image/png'");
    expect(tuple).toContain("'image/webp'");
    expect(
      tuple,
      'image/svg+xml in a PUBLIC bucket is stored XSS on the bucket origin ' +
        '(2026-08-05 admin-portal hardening audit)',
    ).not.toContain('svg');
  });

  it('leaves maintenance with NO mime allowlist', () => {
    // Deliberate, and the opposite of community-assets. The only Content-Type
    // reaching storage here is the browser's File.type on a PUT whose response
    // SubmitForm.tsx does NOT check — so a bucket-level rejection would produce
    // a maintenance request pointing at an object that does not exist. An
    // allowlist would trade a working upload for a silent phantom photo.
    // `documents` (0049) carries NULL for the same reason.
    const tuple = insertFor('maintenance');
    expect(tuple).not.toContain('image/');
    expect(tuple).toMatch(/NULL/);
  });

  it('makes both inserts idempotent', () => {
    // A hand-created bucket must be left alone, not clobbered.
    const inserts = MIGRATION.match(/ON CONFLICT \(id\) DO NOTHING/g) ?? [];
    expect(inserts).toHaveLength(2);
  });

  it('skips cleanly where the storage schema does not exist', () => {
    // Same guard as 0006/0049/0059 — non-Supabase environments (the local
    // bare-Postgres test DB) must not fail the migration run.
    expect(MIGRATION).toMatch(/to_regclass\('storage\.buckets'\) IS NULL/);
    expect(MIGRATION).toMatch(/RETURN;/);
  });

  it('creates NO storage.objects policies', () => {
    // The load-bearing assertion. Private + policy-less is UNREACHABLE
    // (storage.objects is default-deny). Public + policy-less is readable over
    // /object/public/... but NOT enumerable. A SELECT policy here would not
    // grant reads that are already public — it would grant LISTING, which is
    // the cross-tenant leak migration 0041 removed. This test exists so a
    // well-meaning "the public bucket needs a read policy" edit fails loudly.
    expect(MIGRATION).not.toMatch(/CREATE POLICY/i);
  });

  it('provisions exactly the bucket ids the code imports', () => {
    // Keeps the constants load-bearing rather than decorative: if a constant is
    // renamed without the migration, this reddens instead of shipping a bucket
    // nothing writes to.
    expect(MIGRATION).toContain(`'${MAINTENANCE_BUCKET}'`);
    expect(MIGRATION).toContain(`'${COMMUNITY_ASSETS_BUCKET}'`);
  });
});

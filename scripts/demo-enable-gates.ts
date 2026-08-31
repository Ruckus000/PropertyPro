/* eslint-disable no-console -- CLI script; console output is intentional */

/**
 * Enable the per-community legal gates on the seeded demo communities.
 *
 * ── Why this script exists ──
 *
 * Four features ship DISABLED for legal reasons — violation fines, online
 * payments, SMS dispatch and generated notice PDFs. The gates are keys in
 * `communities.community_settings`, absent by default, so every community
 * (including the seeded demo ones) has them off. That is deliberate: local dev
 * should show what a real customer sees, or a gate regression hides locally and
 * surfaces in production.
 *
 * But you still need to be able to demo those features, and flipping five
 * toggles across three communities in the admin UI by hand is friction that
 * invites someone to "temporarily" change the seed instead. So: opt-in, one
 * command, reversible.
 *
 * Usage:
 *   pnpm demo:enable-gates            # turn all gates ON for demo communities
 *   pnpm demo:enable-gates --off      # turn them back OFF
 *
 * SMS additionally needs `SMS_DISPATCH_ENABLED=true` in the environment — the
 * per-community flag alone will not send a text. That is a second, deliberate
 * layer; see apps/web/src/lib/sms/common.ts.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md §2a.
 */
import { pathToFileURL } from 'node:url';
import { inArray, sql } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// The `communities` table is the root tenant table and cannot be scoped by
// community_id, and this is a dev CLI with no request context. Refused outside
// development/ci by assertSeedEnvironment() below.
// AUTHZ: dev-only CLI — out-of-band of tenant scoping with explicit operator authorization.
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { DEMO_COMMUNITIES } from './config/demo-data';
import { assertSeedEnvironment } from './lib/seed-safety';

/**
 * Keep in sync with the `communitySettings` `$type<>` union in
 * packages/db/src/schema/communities.ts.
 *
 * `electionsAttorneyReviewed` is deliberately NOT in this list. Elections are
 * gated on an actual attorney review that has not happened, and the ballot
 * schema still stores a unit-to-candidate link that conflicts with §718.128 —
 * so there is no such thing as "just for the demo" here. Flip it by hand in the
 * admin UI if you genuinely need it.
 */
const DEMO_TOGGLEABLE_GATES = [
  'violationFinesEnabled',
  'assessmentPaymentsEnabled',
  'smsDispatchEnabled',
  'noticePdfGenerationEnabled',
] as const;

export async function runDemoEnableGates(enable: boolean): Promise<void> {
  // Refuses outside development/ci/demo-nightly. This script writes to whatever
  // DATABASE_URL points at, and `.env.local`'s DATABASE_URL is PRODUCTION.
  assertSeedEnvironment();

  const db = createUnscopedClient();
  const slugs = DEMO_COMMUNITIES.map((c) => c.slug);

  const rows = await db
    .select({ id: communities.id, slug: communities.slug, name: communities.name })
    .from(communities)
    .where(inArray(communities.slug, slugs));

  if (rows.length === 0) {
    console.error(
      `No demo communities found (looked for: ${slugs.join(', ')}).\n` +
        'Run `pnpm seed:demo` first.',
    );
    process.exitCode = 1;
    return;
  }

  // Merge into the existing JSONB rather than replacing it — community_settings
  // also carries the write-level restrictions and the fee policy, and clobbering
  // those would be a silent, confusing side effect of a demo convenience script.
  const patch = Object.fromEntries(DEMO_TOGGLEABLE_GATES.map((key) => [key, enable]));

  await db
    .update(communities)
    .set({
      communitySettings: sql`coalesce(${communities.communitySettings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(
      inArray(
        communities.id,
        rows.map((r) => r.id),
      ),
    );

  console.log(`Legal gates ${enable ? 'ENABLED' : 'DISABLED'} for ${rows.length} demo communities:`);
  for (const row of rows) {
    console.log(`  - ${row.name} (${row.slug})`);
  }
  console.log(`\nGates affected: ${DEMO_TOGGLEABLE_GATES.join(', ')}`);
  if (enable) {
    console.log(
      '\nNote: SMS also requires SMS_DISPATCH_ENABLED=true in the environment.\n' +
        'Elections stay gated — flip electionsAttorneyReviewed by hand if you need it.',
    );
  }
  console.log('\nProduction communities are unaffected.');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const enable = !process.argv.includes('--off');
  runDemoEnableGates(enable)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeUnscopedClient());
}

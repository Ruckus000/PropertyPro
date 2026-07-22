/**
 * Reaper for orphaned integration-test communities.
 *
 * WHY THIS EXISTS
 * ---------------
 * Integration suites seed communities with a per-run suffix and clean them up in
 * `afterAll` (see `multi-tenant-test-kit.ts#teardownTestKit`). That teardown is
 * skipped whenever a Vitest worker is killed by a timeout or hard crash, or when
 * `beforeAll` throws mid-seed — so fully-deletable rows are orphaned on the shared
 * (production) database. This reaper is the crash/timeout backstop: it runs once
 * per integration run in the Vitest `globalSetup` main process (which executes even
 * when individual workers die) and can also be scheduled/run by hand.
 *
 * SAFETY
 * ------
 *  - Only communities whose slug matches a known TEST pattern are candidates.
 *  - Real demo communities (ids 1–3) and any `demo-*` seed row are hard-excluded.
 *  - Only communities OLDER than `maxAgeHours` (default 24h) are reaped, so an
 *    in-flight suite (or a concurrent CI run) whose data is fresh is never touched.
 *  - A `safetyCap` aborts the whole transaction if the candidate set is implausibly
 *    large (guards against a botched pattern edit).
 *
 * The cascade discipline mirrors `teardownTestKit`: advisory-lock the audit-log
 * trigger namespace, briefly DISABLE the append-only guard inside the transaction,
 * pre-delete the RESTRICT/NO-ACTION children (compliance_audit_log, provisioning_jobs,
 * conversion_events), then delete the communities (the rest cascade). Postgres rolls
 * the trigger re-enable back automatically if anything throws.
 */
import { pathToFileURL } from 'node:url';
import {
  communities,
  complianceAuditLog,
  conversionEvents,
  provisioningJobs,
} from '@propertypro/db';
import { and, inArray, notInArray, or, sql } from '@propertypro/db/filters';
// AUTHZ: maintenance CLI / test-infra reaper — deletes cross-community test rows
// out-of-band of tenant scoping, with explicit operator authorization. Never runs
// against non-test slugs (see SAFETY above).
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import {
  PROTECTED_COMMUNITY_IDS,
  TEST_COMMUNITY_SLUG_PATTERNS,
} from './reap-test-communities-patterns';

export {
  matchesTestCommunitySlug,
  PROTECTED_COMMUNITY_IDS,
  TEST_COMMUNITY_SLUG_PATTERNS,
} from './reap-test-communities-patterns';

// Same advisory-lock coordinates as teardownTestKit so the reaper and any
// concurrent test teardown serialize the brief append-only-guard toggle.
const AUDIT_LOG_MAINTENANCE_LOCK_NAMESPACE = 817;
const AUDIT_LOG_MAINTENANCE_LOCK_KEY = 1;

export interface ReapOptions {
  /** Unscoped drizzle client. Defaults to a fresh `createUnscopedClient()`. */
  db?: ReturnType<typeof createUnscopedClient>;
  /** Only reap communities created more than this many hours ago. Default 24. */
  maxAgeHours?: number;
  /** If true, resolve candidates but delete nothing. */
  dryRun?: boolean;
  /** Abort if more than this many candidates resolve (botched-pattern guard). Default 1000. */
  safetyCap?: number;
  log?: (message: string) => void;
}

export interface ReapResult {
  reaped: number;
  slugs: string[];
  dryRun: boolean;
}

/**
 * Deletes orphaned test communities. Safe to call repeatedly and concurrently.
 */
export async function reapOrphanedTestCommunities(options: ReapOptions = {}): Promise<ReapResult> {
  const {
    maxAgeHours = 24,
    dryRun = false,
    safetyCap = 1000,
    log = () => {},
  } = options;

  const ownsClient = !options.db;
  const db = options.db ?? createUnscopedClient();

  try {
    // Match ANY known test-slug pattern. Built as OR-of-`~` rather than
    // `~ ANY(array)` because drizzle spreads an interpolated JS array into
    // separate bind params, which Postgres rejects as a non-array ANY operand.
    const slugMatchesTestPattern = or(
      ...TEST_COMMUNITY_SLUG_PATTERNS.map((pattern) => sql`${communities.slug} ~ ${pattern}`),
    );

    const candidates = await db
      .select({ id: communities.id, slug: communities.slug })
      .from(communities)
      .where(
        and(
          sql`${communities.createdAt} < now() - make_interval(hours => ${maxAgeHours})`,
          notInArray(communities.id, PROTECTED_COMMUNITY_IDS as number[]),
          sql`${communities.slug} !~ '^demo-'`,
          slugMatchesTestPattern,
        ),
      );

    const ids = candidates.map((c) => c.id);
    const slugs = candidates.map((c) => c.slug);

    if (ids.length === 0) {
      log('no orphaned test communities to reap');
      return { reaped: 0, slugs: [], dryRun };
    }
    if (ids.length > safetyCap) {
      throw new Error(
        `reap aborted: ${ids.length} candidates exceeds safetyCap ${safetyCap} — refusing to delete`,
      );
    }

    log(`found ${ids.length} orphaned test communities (older than ${maxAgeHours}h)`);

    if (dryRun) {
      log(`dry-run: would delete ${ids.length} communities: ${slugs.join(', ')}`);
      return { reaped: 0, slugs, dryRun: true };
    }

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${AUDIT_LOG_MAINTENANCE_LOCK_NAMESPACE}, ${AUDIT_LOG_MAINTENANCE_LOCK_KEY})`,
      );
      await tx.execute(
        sql`ALTER TABLE compliance_audit_log DISABLE TRIGGER compliance_audit_log_append_only_guard`,
      );
      // RESTRICT / NO-ACTION children that block the community delete.
      await tx.delete(complianceAuditLog).where(inArray(complianceAuditLog.communityId, ids));
      await tx.delete(provisioningJobs).where(inArray(provisioningJobs.communityId, ids));
      await tx.delete(conversionEvents).where(inArray(conversionEvents.communityId, ids));
      // Everything else cascades on the community delete.
      await tx.delete(communities).where(inArray(communities.id, ids));
      await tx.execute(
        sql`ALTER TABLE compliance_audit_log ENABLE TRIGGER compliance_audit_log_append_only_guard`,
      );
    });

    log(`reaped ${ids.length} orphaned test communities`);
    return { reaped: ids.length, slugs, dryRun: false };
  } finally {
    if (ownsClient) {
      await closeUnscopedClient();
    }
  }
}

// --- CLI entry: `tsx --tsconfig apps/web/tsconfig.json scripts/reap-test-communities.ts [--dry-run] [--max-age-hours=N]`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dryRun = process.argv.includes('--dry-run');
  const ageArg = process.argv.find((a) => a.startsWith('--max-age-hours='));
  const maxAgeHours = ageArg ? Number(ageArg.split('=')[1]) : undefined;

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  reapOrphanedTestCommunities({ dryRun, maxAgeHours, log: (m) => console.log(`[reap] ${m}`) })
    .then((r) => {
      console.log(`[reap] done: reaped=${r.reaped} dryRun=${r.dryRun}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[reap] failed:', err);
      process.exit(1);
    });
}

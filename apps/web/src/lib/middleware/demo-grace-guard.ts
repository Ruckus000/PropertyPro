/**
 * Demo grace period write guard.
 *
 * Blocks mutating operations on demo communities that have entered
 * the grace period (trial ended, not yet expired). Non-demo communities
 * short-circuit immediately (isDemo === false).
 *
 * Uses createUnscopedClient() because `communities` is in
 * RLS_GLOBAL_TABLE_EXCLUSIONS.
 *
 * NOTE: imports are lazy (inside the function) to avoid triggering
 * DATABASE_URL initialization at module load time, which breaks unit
 * tests that mock route dependencies without setting DATABASE_URL.
 */
import { computeDemoStatus } from '@propertypro/shared';

/**
 * Asserts that the given community is NOT in demo grace period.
 * Throws 403 if the community's trial has ended but lockout hasn't hit yet.
 *
 * Call after community ID is resolved, before any write logic.
 * Cost: one PK-lookup SELECT per mutation in demo communities during grace.
 * Non-demo communities short-circuit immediately.
 */
export async function assertNotDemoGrace(communityId: number): Promise<void> {
  // Lazy imports to avoid triggering DB connection at module load time
  const { createUnscopedClient } = await import('@propertypro/db/unsafe');
  const { communities } = await import('@propertypro/db');
  const { eq } = await import('@propertypro/db/filters');
  const { AppError } = await import('@/lib/api/errors/AppError');

  const db = createUnscopedClient();
  const rows = await db
    .select({
      isDemo: communities.isDemo,
      trialEndsAt: communities.trialEndsAt,
      demoExpiresAt: communities.demoExpiresAt,
      deletedAt: communities.deletedAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const community = rows[0];
  if (!community) return;

  // Fast path: non-demo communities never hit grace
  if (!community.isDemo) return;

  const status = computeDemoStatus(community);
  if (status === 'grace_period') {
    throw new AppError(
      'Your trial has ended. Subscribe to regain full access.',
      403,
      'DEMO_GRACE_READ_ONLY',
    );
  }
}

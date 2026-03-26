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
 *
 * Two-step query: first checks isDemo only (always-existing column),
 * then fetches lifecycle timestamps only for demo communities. This
 * avoids errors when trial_ends_at migration hasn't been applied yet.
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

  const db = createUnscopedClient();

  // Step 1: Fast check — is this community a demo? (always-safe column)
  const [basicRow] = await db
    .select({ isDemo: communities.isDemo })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!basicRow || !basicRow.isDemo) return;

  // Step 2: Full lifecycle check — only for demo communities
  try {
    const [fullRow] = await db
      .select({
        isDemo: communities.isDemo,
        trialEndsAt: communities.trialEndsAt,
        demoExpiresAt: communities.demoExpiresAt,
        deletedAt: communities.deletedAt,
      })
      .from(communities)
      .where(eq(communities.id, communityId))
      .limit(1);

    if (!fullRow) return;

    const status = computeDemoStatus(fullRow);
    if (status === 'grace_period') {
      const { AppError } = await import('@/lib/api/errors/AppError');
      throw new AppError(
        'Your trial has ended. Subscribe to regain full access.',
        403,
        'DEMO_GRACE_READ_ONLY',
      );
    }
  } catch (err) {
    // If the trial_ends_at column doesn't exist yet (pre-migration),
    // skip the grace check. The guard only applies after migrations run.
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'DEMO_GRACE_READ_ONLY') {
      throw err; // Re-throw our own AppError
    }
    // Column missing or other DB error — allow the operation
    console.warn('[demo-grace-guard] lifecycle check failed, allowing operation:', (err as Error).message);
  }
}
